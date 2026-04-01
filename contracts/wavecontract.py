# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class WaveContract(gl.Contract):
    current_wave: bigint
    total_kills: bigint
    next_wave_config: str

    def __init__(self):
        self.current_wave = 1
        self.total_kills = 0
        self.next_wave_config = '{"wave": 1, "enemy_count": 7, "enemy_speed_mult": 1.0, "enemy_hp_mult": 1.0, "spawn_rate_mult": 1.0, "event": "none", "flavor_text": "The swarm begins!"}'

    @gl.public.view
    def get_next_wave_config(self) -> str:
        return self.next_wave_config

    @gl.public.write
    def report_wave_result(
        self,
        kills: bigint,
        damage_taken: bigint,
        health_pct: float,
        shots_fired: bigint,
        shots_hit: bigint
    ):
        self.total_kills = self.total_kills + kills
        self.current_wave = self.current_wave + 1
        accuracy = (shots_hit / shots_fired * 100) if shots_fired > 0 else 0
        
        # The AI Director decides the difficulty of the next wave based on player performance
        prompt = (
            f"The player just finished Wave {self.current_wave - 1}. "
            f"Stats: {kills} kills, {damage_taken} damage taken, {health_pct}% HP remaining, {accuracy:.1f}% accuracy.\n"
            f"Act as an intelligent Game Director. If the player is struggling (low HP, high damage), give them a slower, easier wave to recover. "
            f"If the player is dominating (high HP, high accuracy), increase the speed and spawn rate aggressively.\n"
            f"Generate the Wave {self.current_wave} config in JSON format:\n"
            f'{{"wave": {self.current_wave}, "enemy_count": int, "enemy_speed_mult": float, "enemy_hp_mult": float, "spawn_rate_mult": float, "event": "none|ambush", "flavor_text": "A short, fitting 1-sentence warning for the HUD"}}'
        )

        result = gl.exec_prompt(
            prompt,
            response_format="json"
        )
        self.next_wave_config = str(result)
