import random
from constants import DEFAULT_MESSAGES


def get_default_message(state):
    if state.current_default_msg is None:
        state.current_default_msg = random.choice(DEFAULT_MESSAGES)
    return state.current_default_msg


def get_zone_message(zone, current_poi, time_bonus=None):
    if zone == "frio":
        return "Frio..."
    if zone == "quente":
        return "Quente!"
    if zone == "val":
        if time_bonus is not None:
            return f"Chegaste a {current_poi}! Bónus de tempo: +{time_bonus}"
        return f"Chegaste a {current_poi}!"
    return None
