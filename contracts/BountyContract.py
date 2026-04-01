# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
import json
from genlayer import *

class BountyContract(gl.Contract):
    active_bounty: str

    def __init__(self):
        # Default empty bounty
        self.active_bounty = '{"has_bounty": false, "target_id": "", "multiplier": 1.0, "flavor_text": ""}'

    @gl.public.view
    def get_bounty(self) -> str:
        return self.active_bounty

    @gl.public.write
    def check_for_bounty(self, blue_score: bigint, red_score: bigint, top_player_id: str, top_player_kills: bigint):
        # If the score gap isn't big enough, clear the bounty
        if abs(blue_score - red_score) < 10:
            self.active_bounty = '{"has_bounty": false, "target_id": "", "multiplier": 1.0, "flavor_text": ""}'
            return

        # Determine who is dominating
        winning_team = "Blue" if blue_score > red_score else "Red"
        losing_team = "Red" if blue_score > red_score else "Blue"
        
        prompt = (
            f"The {winning_team} team is dominating the {losing_team} team in a Team Deathmatch (Score: {blue_score} to {red_score}). "
            f"The MVP of the {winning_team} team has {top_player_kills} kills. "
            f"Generate a bounty event placing a massive target on the MVP to give the {losing_team} team a comeback chance. "
            f"Set 'has_bounty' to true, 'target_id' to '{top_player_id}', and 'multiplier' to 3.0. "
            f"Write a cool, alarm-style 'flavor_text' announcing the bounty. "
            f"Return ONLY valid JSON format: {{\"has_bounty\": bool, \"target_id\": str, \"multiplier\": float, \"flavor_text\": str}}"
        )

        result = gl.exec_prompt(
            prompt,
            response_format="json",
            max_tokens=100
        )
        
        self.active_bounty = str(result)
