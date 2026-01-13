import * as React from "react";

export interface SevenSegmentClockProps {
    className?: string;

    /** Font for the main clock (hours + minutes) */
    clockFontFamily?: string;

    /** Font for the AM / PM text */
    ampmFontFamily?: string;
}

export const SevenSegmentClock: React.FC<SevenSegmentClockProps> = ({
        className,
        clockFontFamily = "monospace",
        ampmFontFamily = "sans-serif",
    }) => {
    const [time, setTime] = React.useState({
        hrs: "--",
        mins: "--",
        ampm: "",
    });

    const [showColon, setShowColon] = React.useState(true);

    React.useEffect(() => {
        function tick() {
            const now = new Date();
            let hours = now.getHours();
            const minutes = now.getMinutes();
            const ampm = hours >= 12 ? "PM" : "AM";

            hours = hours % 12 || 12;

            const hStr = hours < 10 ? " " + hours : String(hours);
            const mStr = minutes < 10 ? "0" + minutes : String(minutes);

            setTime({ hrs: hStr, mins: mStr, ampm });

            // Toggle colon every second
            setShowColon((prev) => !prev);
        }

        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    return (
        <div
            className={className}
            style={{
                display: "flex",
                alignItems: "baseline",
                fontFamily: clockFontFamily,
            }}
        >
            <span>{time.hrs}</span>

            {/* Blinking colon */}
            <span
                style={{
                    margin: "0 6px",
                    opacity: showColon ? 1 : 0,
                    transition: "opacity 0.1s linear",
                }}
            >
        :
      </span>

            <span>{time.mins}</span>

            {/* AM / PM */}
            <span
                style={{
                    marginLeft: 12,
                    fontSize: "18px",
                    fontFamily: ampmFontFamily,
                }}
            >
        {time.ampm}
      </span>
        </div>
    );
};
