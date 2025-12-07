# Day 27: Boundaries - World Time Zones
# Shows current time in each timezone, centered on user's location

library(mapgl)
library(sf)
library(dplyr)
library(lubridate)

# Get user's current timezone and time
user_tz <- Sys.timezone()
user_time <- Sys.time()

# Calculate UTC offset by comparing local vs UTC hour
local_hour <- as.numeric(format(user_time, "%H")) +
  as.numeric(format(user_time, "%M")) / 60
utc_hour <- as.numeric(format(with_tz(user_time, "UTC"), "%H")) +
  as.numeric(format(with_tz(user_time, "UTC"), "%M")) / 60
user_offset <- local_hour - utc_hour
# Handle day boundary crossings
if (user_offset > 12) user_offset <- user_offset - 24
if (user_offset < -12) user_offset <- user_offset + 24

# Approximate center longitude for user's timezone
user_center_lon <- user_offset * 15 # Each hour = 15 degrees longitude

cat("Your timezone:", user_tz, "\n")
cat("Your current time:", format(user_time, "%Y-%m-%d %H:%M:%S %Z"), "\n")
cat(
  "UTC offset:",
  ifelse(user_offset >= 0, paste0("+", user_offset), user_offset),
  "hours\n"
)

# Download Natural Earth time zones
tz_url <- paste0(
  "https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/",
  "ne_10m_time_zones.geojson"
)

timezones <- st_read(tz_url)

# Calculate current time for each timezone
utc_now <- with_tz(Sys.time(), "UTC")

timezones <- timezones |>
  mutate(
    # Parse the zone field to get offset (can be fractional like 5.5, 5.75)
    utc_offset = as.numeric(zone),
    # Convert offset to minutes for accurate time calculation
    offset_minutes = as.integer(utc_offset * 60),
    # Calculate current time in this zone using minutes
    current_time = utc_now + minutes(offset_minutes),
    # Format for display
    time_display = format(current_time, "%H:%M"),
    time_ampm = format(current_time, "%I:%M %p"),
    date_display = format(current_time, "%b %d"),
    # Day/night indicator (rough approximation)
    hour_num = hour(current_time),
    is_night = hour_num < 6 | hour_num >= 20,
    is_day = hour_num >= 8 & hour_num < 18,
    # Create display label - format fractional offsets nicely
    offset_label = case_when(
      utc_offset == 0 ~ "UTC",
      utc_offset %% 1 == 0 & utc_offset > 0 ~ paste0("UTC+", as.integer(utc_offset)),
      utc_offset %% 1 == 0 & utc_offset < 0 ~ paste0("UTC", as.integer(utc_offset)),
      utc_offset %% 1 == 0.5 & utc_offset > 0 ~ paste0("UTC+", floor(utc_offset), ":30"),
      utc_offset %% 1 == 0.5 & utc_offset < 0 ~ paste0("UTC", ceiling(utc_offset), ":30"),
      utc_offset %% 1 == -0.5 & utc_offset < 0 ~ paste0("UTC", floor(utc_offset), ":30"),
      utc_offset %% 1 == 0.75 & utc_offset > 0 ~ paste0("UTC+", floor(utc_offset), ":45"),
      utc_offset %% 1 == 0.75 & utc_offset < 0 ~ paste0("UTC", ceiling(utc_offset), ":45"),
      utc_offset > 0 ~ paste0("UTC+", utc_offset),
      TRUE ~ paste0("UTC", utc_offset)
    ),
    # Flag user's timezone (approximate match by offset)
    is_user_tz = abs(utc_offset - user_offset) < 0.5
  )

# Time zone color palette - dawn to dusk gradient
tz_palette <- c(
  "#1e3a5f", # UTC-12 (deep night blue)
  "#2d4a6f", # UTC-10
  "#3d5a7f", # UTC-8
  "#5a7a9f", # UTC-6
  "#7a9abf", # UTC-4

  "#9abadf", # UTC-2
  "#f0f4f8", # UTC (neutral dawn)
  "#ffe4b5", # UTC+2
  "#ffc987", # UTC+4
  "#ffaa5c", # UTC+6
  "#ff8533", # UTC+8
  "#ff5500", # UTC+10
  "#cc3300"
)

# Build info panel with user's current time
info_html <- paste0(
  "<div style='font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif; ",
  "background: rgba(20, 20, 30, 0.95); padding: 16px 20px; border-radius: 8px; ",
  "border: 1px solid rgba(255, 255, 255, 0.1); max-width: 320px;'>",
  "<div style='font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px;'>",
  "World Time Zones</div>",
  "<div style='background: rgba(255, 200, 100, 0.15); border: 1px solid rgba(255, 200, 100, 0.4); ",
  "border-radius: 6px; padding: 10px 12px; margin-bottom: 12px;'>",
  "<div style='font-size: 11px; color: #ffc864; text-transform: uppercase; letter-spacing: 0.5px;'>Your Time</div>",
  "<div style='font-size: 24px; font-weight: 700; color: #fff;'>",
  format(user_time, "%H:%M"),
  "</div>",
  "<div style='font-size: 12px; color: #aaa;'>",
  user_tz,
  " (UTC",
  ifelse(user_offset >= 0, "+", ""),
  round(user_offset),
  ")",
  "</div>",
  "</div>",
  "<div style='font-size: 12px; color: #888; line-height: 1.5;'>",
  "Hover over any zone to see its current time. ",
  "Colors shift from cool (behind UTC) to warm (ahead of UTC).</div>",
  "<div style='font-size: 10px; color: #555; margin-top: 10px;'>",
  "Source: Natural Earth</div>",
  "</div>"
)

maplibre(
  style = carto_style("dark-matter"),
  center = c(user_center_lon, 30),
  zoom = 3
) |>
  # Fill layer for time zones
  add_fill_layer(
    id = "timezone-fill",
    source = timezones,
    fill_color = interpolate(
      column = "utc_offset",
      values = c(-12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 12),
      stops = tz_palette
    ),
    fill_opacity = 0.7,
    hover_options = list(
      fill_opacity = 0.95
    ),
    tooltip = concat(
      "<div style='background: #1a1a2e; padding: 14px 18px; border-radius: 8px; ",
      "border: 1px solid rgba(255, 255, 255, 0.2); font-family: system-ui;'>",
      "<div style='font-size: 32px; font-weight: 700; color: #fff;'>",
      get_column("time_display"),
      "</div>",
      "<div style='font-size: 13px; color: #888; margin-bottom: 8px;'>",
      get_column("time_ampm"),
      "</div>",
      "<div style='font-size: 13px; color: #aaa; margin-bottom: 8px;'>",
      get_column("date_display"),
      "</div>",
      "<div style='font-size: 14px; font-weight: 600; color: #ffc864;'>",
      get_column("offset_label"),
      "</div>",
      "</div>"
    )
  ) |>
  # Boundary lines
  add_line_layer(
    id = "timezone-lines",
    source = timezones,
    line_color = "#ffffff",
    line_width = interpolate(
      property = "zoom",
      values = c(1, 4, 8),
      stops = c(0.3, 0.8, 1.5)
    ),
    line_opacity = 0.4
  ) |>
  # Title
  add_control(
    html = info_html,
    position = "top-left"
  ) |>
  add_legend(
    legend_title = "UTC Offset",
    values = c("-12", "-6", "0", "+6", "+12"),
    colors = c("#1e3a5f", "#5a7a9f", "#f0f4f8", "#ffaa5c", "#cc3300"),
    type = "continuous",
    position = "bottom-left"
  ) |>
  add_navigation_control(position = "top-right") |>
  add_fullscreen_control(position = "top-right")
