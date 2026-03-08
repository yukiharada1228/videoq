from datetime import datetime


class TimestampConverter:
    """Handles timestamp conversions between seconds and SRT format"""

    @staticmethod
    def seconds_to_timestamp(seconds: float) -> str:
        """Convert seconds to timestamp in HH:MM:SS,mmm format"""
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        milliseconds = round((seconds % 1) * 1000)

        # Handle potential overflow from rounding milliseconds
        if milliseconds == 1000:
            milliseconds = 0
            secs += 1
        if secs == 60:
            secs = 0
            minutes += 1
        if minutes == 60:
            minutes = 0
            hours += 1

        return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"

    @staticmethod
    def parse_timestamp(timestamp: str) -> float:
        """
        Convert timestamp string (HH:MM:SS,mmm or HH:MM:SS) to seconds
        """
        # Normalize the timestamp: replace dot with comma for consistency
        timestamp = timestamp.replace(".", ",")
        parts = timestamp.split(",")
        try:
            t = datetime.strptime(parts[0], "%H:%M:%S")
        except ValueError:
            # Handle cases where hour might be missing or other formats
            t = datetime.strptime(parts[0], "%M:%S")

        seconds = float(t.hour * 3600 + t.minute * 60 + t.second)
        if len(parts) > 1:
            milliseconds = int(parts[1])
            seconds += milliseconds / 1000.0
        return seconds

    @staticmethod
    def calculate_duration(start_timestamp: str, end_timestamp: str) -> float:
        """Calculate duration in seconds between two timestamps"""
        start_sec = TimestampConverter.parse_timestamp(start_timestamp)
        end_sec = TimestampConverter.parse_timestamp(end_timestamp)
        return end_sec - start_sec
