-- SQL Query to find squawk transitions in InfluxDB
-- This query identifies aircraft that changed their squawk codes within a time window
-- It shows where (lat/lon) and when the transition occurred

SELECT
    icao,
    flight,
    registration,
    type,
    squawk_from,
    squawk_to,
    lat,
    lon,
    altitude_ft,
    time,
    time_diff_minutes
FROM (
    -- Get consecutive squawk readings for each aircraft
    SELECT
        icao,
        flight,
        registration,
        type,
        squawk as squawk_from,
        LEAD(squawk) OVER (PARTITION BY icao ORDER BY time) as squawk_to,
        lat,
        lon,
        altitude_ft,
        time,
        -- Calculate time difference to next reading in minutes
        ROUND(
            (LEAD(time) OVER (PARTITION BY icao ORDER BY time) - time) / 1000000000 / 60,
            2
        ) as time_diff_minutes
    FROM aircraft_positions
    WHERE
        time >= now() - interval '24 hours'  -- Adjust time window as needed
        AND squawk != 'N/A'  -- Only aircraft with valid squawk codes
        AND squawk IS NOT NULL
)
WHERE
    squawk_from != squawk_to  -- Only show actual transitions
    AND squawk_to IS NOT NULL  -- Exclude the last record (no transition)
    AND time_diff_minutes <= 15  -- Only transitions within 15 minutes (same flight)
    AND time_diff_minutes > 0    -- Valid time progression
ORDER BY time DESC
LIMIT 100