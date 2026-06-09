QUIZ_POINTS = 100
MAX_TIME_BONUS = 50
TIME_BONUS_LIMIT_SECONDS = 180

def calculate_time_bonus(seconds_elapsed):
    if seconds_elapsed >= TIME_BONUS_LIMIT_SECONDS:
        return 0
    ratio = 1 - (seconds_elapsed / TIME_BONUS_LIMIT_SECONDS)
    return round(MAX_TIME_BONUS * ratio)

def calculate_quiz_points(is_correct):
    return QUIZ_POINTS if is_correct else 0
