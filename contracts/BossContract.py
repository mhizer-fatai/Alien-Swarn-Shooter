# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class BossContract(gl.Contract):
    last_boss_json: str

    def __init__(self):
        self.last_boss_json = '{"boss_name": "The Queen", "hp_mult": 10.0, "speed_mult": 0.5, "ability": "none", "flavor_text": ""}'

    @gl.public.view
    def get_latest_boss(self) -> str:
        return self.last_boss_json

    @gl.public.write
    def generate_boss_for_wave_10(self, favorite_powerup: str, most_damage_taken_from: str, average_accuracy: float):
        # AI creates a custom boss to counter the team
        prompt = (
            f"The player team has reached Wave 10. "
            f"Their favorite power-up so far is '{favorite_powerup}'. "
            f"Most of the damage they took was from '{most_damage_taken_from}'. "
            f"Their average team accuracy is {average_accuracy:.1f}%. "
            f"Generate a customized Boss configuration designed specifically to counter their playstyle. "
            f"If they use spread shot, make the boss have high armor. If they are very accurate, make the boss erratic and fast. "
            f"Abilities can be: 'laser_sweep', 'spawn_minions', or 'shield_regen'. "
            f"Invent a menacing Boss Name and flavor text announcing its arrival. "
            f"Return ONLY valid JSON format: "
            f'{{"boss_name": str, "hp_mult": float, "speed_mult": float, "ability": str, "flavor_text": str}}'
        )

        result = gl.exec_prompt(
            prompt,
            response_format="json",
            max_tokens=150
        )
        
        self.last_boss_json = str(result)
