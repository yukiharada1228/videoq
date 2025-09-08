from django import template

register = template.Library()


@register.filter
def format_hms(value):
    """秒数(float可)を h:mm:ss または m:ss に整形（切り捨て基準）"""
    try:
        seconds = float(value or 0)
    except (TypeError, ValueError):
        return "0:00"

    total_seconds = int(seconds)  # 小数は切り捨て
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"
