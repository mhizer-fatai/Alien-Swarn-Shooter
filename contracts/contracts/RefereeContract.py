# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

class RefereeContract(gl.Contract):
    top_score: bigint
    top_player: str
    champion_title: str

    def __init__(self):
        self.top_score = 0
        self.top_player = "Unknown"
        self.champion_title = "Rookie Pilot"

    @gl.public.view
    def get_champion(self) -> str:
        return f'{{"player": "{self.top_player}", "score": {self.top_score}, "title": "{self.champion_title}"}}'

    @gl.public.write
    def submit_run(self, player_name: str, score: bigint, waves_survived: bigint, accuracy_pct: float):
        if score > self.top_score:
            self.top_score = score
            self.top_player = player_name
            
            prompt = (
                f"Player '{player_name}' achieved a new high score of {score} in the Alien Swarm shooter game! "
                f"They survived {waves_survived} waves with {accuracy_pct:.1f}% accuracy. "
                f"Based on these stats, invent a short, badass 2-to-3 word sci-fi title for them. "
                f"For example: 'Star Sniper' (if high accuracy), 'Void Survivor' (if high waves, low accuracy), etc. "
                f"Return ONLY the title, no explanation."
            )
            
            result = gl.exec_prompt(
                prompt,
                max_tokens=20
            )
            
            self.champion_title = str(result).strip(' "\'\n')
