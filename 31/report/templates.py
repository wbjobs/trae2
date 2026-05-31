DEFAULT_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CNC Simulation Report - {filename}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #1e1e1e; color: #e0e0e0; padding: 20px; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        h1 {{ color: #4fc3f7; border-bottom: 2px solid #4fc3f7; padding-bottom: 10px; margin-bottom: 20px; }}
        h2 {{ color: #81c784; margin-top: 25px; margin-bottom: 15px; }}
        h3 {{ color: #ffb74d; margin-top: 20px; margin-bottom: 10px; }}
        .summary {{ background: #2d2d2d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }}
        .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }}
        .summary-item {{ background: #3d3d3d; padding: 15px; border-radius: 6px; border-left: 3px solid #4fc3f7; }}
        .summary-item .label {{ font-size: 12px; color: #888; text-transform: uppercase; }}
        .summary-item .value {{ font-size: 20px; font-weight: bold; margin-top: 5px; }}
        .status-pass {{ color: #81c784; }}
        .status-warn {{ color: #ffb74d; }}
        .status-fail {{ color: #e57373; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 15px; }}
        th {{ background: #4fc3f7; color: #1e1e1e; padding: 12px; text-align: left; font-weight: bold; }}
        td {{ padding: 10px 12px; border-bottom: 1px solid #444; }}
        tr:nth-child(even) {{ background: #2d2d2d; }}
        tr:hover {{ background: #3d3d3d; }}
        .event-list {{ max-height: 400px; overflow-y: auto; }}
        .collision-badge {{ display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; }}
        .collision-critical {{ background: #e57373; color: #fff; }}
        .collision-warning {{ background: #ffb74d; color: #1e1e1e; }}
        .limit-badge {{ display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold; background: #ff9800; color: #fff; }}
        .section {{ background: #2d2d2d; border-radius: 8px; padding: 20px; margin-top: 20px; }}
        .footer {{ text-align: center; margin-top: 40px; padding: 20px; color: #666; font-size: 12px; border-top: 1px solid #444; }}
        .no-events {{ color: #81c784; padding: 20px; text-align: center; font-style: italic; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>CNC Simulation Report</h1>
        <div class="summary">
            <h2>Summary</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">File</div>
                    <div class="value">{filename}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Machine</div>
                    <div class="value">{machine_name}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Commands</div>
                    <div class="value">{total_commands}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Processed</div>
                    <div class="value">{processed_commands}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Path Length</div>
                    <div class="value">{total_path_length:.2f} mm</div>
                </div>
                <div class="summary-item">
                    <div class="label">Rapid Length</div>
                    <div class="value">{rapid_path_length:.2f} mm</div>
                </div>
                <div class="summary-item">
                    <div class="label">Feed Length</div>
                    <div class="value">{feed_path_length:.2f} mm</div>
                </div>
                <div class="summary-item">
                    <div class="label">Duration</div>
                    <div class="value">{simulation_duration:.2f} s</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>Verification Status</h2>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">Collisions</div>
                    <div class="value {collision_status_class}">{collision_count} {collision_status_text}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Limit Violations</div>
                    <div class="value {limit_status_class}">{limit_violation_count} {limit_status_text}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Errors</div>
                    <div class="value {error_status_class}">{error_count} {error_status_text}</div>
                </div>
                <div class="summary-item">
                    <div class="label">Warnings</div>
                    <div class="value {warning_status_class}">{warning_count} {warning_status_text}</div>
                </div>
            </div>
        </div>

        {collision_section}

        {limit_section}

        {error_section}

        {warning_section}

        <div class="footer">
            CNC Simulator v1.0.0 | Generated {timestamp}
        </div>
    </div>
</body>
</html>"""


def get_html_template() -> str:
    return DEFAULT_HTML_TEMPLATE


def get_text_template() -> str:
    return "CNC Simulation Report\n" + "=" * 50 + "\n\n"
