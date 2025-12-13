-- Advanced SQL Query for Squawk Transitions Analysis
-- Includes emergency code detection and transition categorization

-- Emergency squawk codes (7500=Hijack, 7600=Radio failure, 7700=Emergency)
WITH emergency_codes AS (
    SELECT '7500' as code, 'Hijack' as description
    UNION ALL
    SELECT '7600', 'Radio Failure'
    UNION ALL
    SELECT '7700', 'General Emergency'
),

transitions AS (
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
        speed_kt,
        time,
        ROUND(
            (LEAD(time) OVER (PARTITION BY icao ORDER BY time) - time) / 1000000000 / 60,
            2
        ) as time_diff_minutes,
        -- Categorize transition types
        CASE
            WHEN squawk = '7500' OR LEAD(squawk) OVER (PARTITION BY icao ORDER BY time) = '7500' THEN 'Emergency_7500'
            WHEN squawk = '7600' OR LEAD(squawk) OVER (PARTITION BY icao ORDER BY time) = '7600' THEN 'Emergency_7600'
            WHEN squawk = '7700' OR LEAD(squawk) OVER (PARTITION BY icao ORDER BY time) = '7700' THEN 'Emergency_7700'
            WHEN CAST(squawk AS INTEGER) BETWEEN 0000 AND 0777 THEN 'VFR_Code'
            WHEN CAST(squawk AS INTEGER) BETWEEN 1000 AND 1777 THEN 'IFR_Code'
            ELSE 'Other'
        END as transition_category
    FROM aircraft_positions
    WHERE
        time >= now() - interval '24 hours'
        AND squawk != 'N/A'
        AND squawk IS NOT NULL
        AND squawk ~ '^[0-9]{4}$'  -- Only valid 4-digit squawk codes
)

SELECT
    t.*,
    e.description as emergency_description,
    -- Calculate distance from receiver (if r_dst field exists)
    CASE WHEN r_dst IS NOT NULL THEN ROUND(r_dst, 1) ELSE NULL END as distance_nm
FROM transitions t
LEFT JOIN emergency_codes e ON (t.squawk_from = e.code OR t.squawk_to = e.code)
WHERE
    squawk_from != squawk_to
    AND squawk_to IS NOT NULL
    AND time_diff_minutes <= 15
    AND time_diff_minutes > 0
ORDER BY
    -- Prioritize emergency transitions
    CASE WHEN transition_category LIKE 'Emergency%' THEN 1 ELSE 2 END,
    time DESC
LIMIT 200