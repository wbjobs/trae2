import os
from datetime import datetime
from typing import List, Optional
from .models import ReportData, ReportCollisionEvent, ReportLimitEvent, ReportError, ReportWarning
from .templates import get_html_template


class ReportGenerator:
    def __init__(self, report_data: ReportData):
        self.data = report_data

    def generate_html(self, output_dir: str = './reports') -> str:
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = os.path.splitext(os.path.basename(self.data.filename))[0]
        filename = f'report_{base_name}_{timestamp}.html'
        filepath = os.path.join(output_dir, filename)

        html = self._render_html()

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)

        return filepath

    def generate_text(self, output_dir: str = './reports') -> str:
        os.makedirs(output_dir, exist_ok=True)

        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = os.path.splitext(os.path.basename(self.data.filename))[0]
        filename = f'report_{base_name}_{timestamp}.txt'
        filepath = os.path.join(output_dir, filename)

        text = self._render_text()

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)

        return filepath

    def _render_html(self) -> str:
        template = get_html_template()

        collision_count = sum(1 for e in self.data.collision_events if e.distance < 0.1)
        warning_count = len(self.data.warnings)
        error_count = len(self.data.errors)
        limit_violation_count = len(self.data.limit_violations)

        collision_status_class = 'status-fail' if collision_count > 0 else 'status-pass'
        collision_status_text = 'collisions detected' if collision_count > 0 else 'no collisions'

        limit_status_class = 'status-fail' if limit_violation_count > 0 else 'status-pass'
        limit_status_text = 'violations' if limit_violation_count > 0 else 'none'

        error_status_class = 'status-fail' if error_count > 0 else 'status-pass'
        error_status_text = 'errors' if error_count > 0 else 'none'

        warning_status_class = 'status-warn' if warning_count > 0 else 'status-pass'
        warning_status_text = 'warnings' if warning_count > 0 else 'none'

        collision_section = self._render_collision_section()
        limit_section = self._render_limit_section()
        error_section = self._render_error_section()
        warning_section = self._render_warning_section()

        return template.format(
            filename=os.path.basename(self.data.filename),
            machine_name=self.data.machine_name,
            total_commands=self.data.total_commands,
            processed_commands=self.data.processed_commands,
            total_path_length=self.data.total_path_length,
            rapid_path_length=self.data.rapid_path_length,
            feed_path_length=self.data.feed_path_length,
            simulation_duration=self.data.simulation_duration,
            collision_count=collision_count,
            collision_status_class=collision_status_class,
            collision_status_text=collision_status_text,
            limit_violation_count=limit_violation_count,
            limit_status_class=limit_status_class,
            limit_status_text=limit_status_text,
            error_count=error_count,
            error_status_class=error_status_class,
            error_status_text=error_status_text,
            warning_count=warning_count,
            warning_status_class=warning_status_class,
            warning_status_text=warning_status_text,
            collision_section=collision_section,
            limit_section=limit_section,
            error_section=error_section,
            warning_section=warning_section,
            timestamp=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        )

    def _render_collision_section(self) -> str:
        if not self.data.collision_events:
            return '<div class="section"><h2>Collision Detection</h2><div class="no-events">No collision events detected</div></div>'

        rows = ''
        for event in self.data.collision_events:
            is_critical = event.distance < 0.1
            badge_class = 'collision-critical' if is_critical else 'collision-warning'
            label = 'COLLISION' if is_critical else 'WARNING'
            pos_str = ', '.join(f'{k}={v:.3f}' for k, v in event.position.items())

            rows += f'''
            <tr>
                <td>{event.command_index}</td>
                <td><span class="collision-badge {badge_class}">{label}</span></td>
                <td>{event.collision_type}</td>
                <td>{event.distance:.4f}</td>
                <td>{pos_str}</td>
                <td>{event.object_a} / {event.object_b}</td>
                <td>{event.details}</td>
            </tr>'''

        return f'''
        <div class="section">
            <h2>Collision Detection ({len(self.data.collision_events)} events)</h2>
            <div class="event-list">
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>Status</th>
                            <th>Type</th>
                            <th>Distance (mm)</th>
                            <th>Position</th>
                            <th>Objects</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>
        </div>'''

    def _render_limit_section(self) -> str:
        if not self.data.limit_violations:
            return '<div class="section"><h2>Axis Limit Violations</h2><div class="no-events">No axis limit violations detected</div></div>'

        rows = ''
        for event in self.data.limit_violations:
            rows += f'''
            <tr>
                <td>{event.command_index}</td>
                <td><span class="limit-badge">LIMIT</span></td>
                <td>{event.axis}</td>
                <td>{event.limit_type}</td>
                <td>{event.distance:.4f}</td>
                <td>{event.position:.3f}</td>
            </tr>'''

        return f'''
        <div class="section">
            <h2>Axis Limit Violations ({len(self.data.limit_violations)} events)</h2>
            <div class="event-list">
                <table>
                    <thead>
                        <tr>
                            <th>Command</th>
                            <th>Status</th>
                            <th>Axis</th>
                            <th>Limit Type</th>
                            <th>Distance (mm)</th>
                            <th>Position (mm)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>
        </div>'''

    def _render_error_section(self) -> str:
        if not self.data.errors:
            return '<div class="section"><h2>Errors</h2><div class="no-events">No errors detected</div></div>'

        rows = ''
        for error in self.data.errors:
            rows += f'''
            <tr>
                <td>{error.line_number}</td>
                <td>{error.error_type}</td>
                <td>{error.message}</td>
            </tr>'''

        return f'''
        <div class="section">
            <h2>Errors ({len(self.data.errors)} events)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Line</th>
                        <th>Type</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>'''

    def _render_warning_section(self) -> str:
        if not self.data.warnings:
            return '<div class="section"><h2>Warnings</h2><div class="no-events">No warnings detected</div></div>'

        rows = ''
        for warning in self.data.warnings:
            rows += f'''
            <tr>
                <td>{warning.line_number}</td>
                <td>{warning.message}</td>
            </tr>'''

        return f'''
        <div class="section">
            <h2>Warnings ({len(self.data.warnings)} events)</h2>
            <table>
                <thead>
                    <tr>
                        <th>Line</th>
                        <th>Message</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>'''

    def _render_text(self) -> str:
        lines = []
        lines.append('CNC Simulation Report')
        lines.append('=' * 60)
        lines.append(f'File: {self.data.filename}')
        lines.append(f'Machine: {self.data.machine_name}')
        lines.append(f'Total Commands: {self.data.total_commands}')
        lines.append(f'Processed: {self.data.processed_commands}')
        lines.append(f'Total Path Length: {self.data.total_path_length:.2f} mm')
        lines.append(f'Rapid Length: {self.data.rapid_path_length:.2f} mm')
        lines.append(f'Feed Length: {self.data.feed_path_length:.2f} mm')
        lines.append(f'Duration: {self.data.simulation_duration:.2f} s')
        lines.append('')

        lines.append('Collision Events:')
        if self.data.collision_events:
            for event in self.data.collision_events:
                status = 'COLLISION' if event.distance < 0.1 else 'WARNING'
                lines.append(f'  [{status}] {event.collision_type} - dist={event.distance:.4f}mm - {event.details}')
        else:
            lines.append('  None')
        lines.append('')

        lines.append('Limit Violations:')
        if self.data.limit_violations:
            for event in self.data.limit_violations:
                lines.append(f'  Axis {event.axis} {event.limit_type} limit: {event.distance:.4f}mm')
        else:
            lines.append('  None')
        lines.append('')

        lines.append('Errors:')
        if self.data.errors:
            for error in self.data.errors:
                lines.append(f'  Line {error.line_number}: [{error.error_type}] {error.message}')
        else:
            lines.append('  None')
        lines.append('')

        lines.append('Warnings:')
        if self.data.warnings:
            for warning in self.data.warnings:
                lines.append(f'  Line {warning.line_number}: {warning.message}')
        else:
            lines.append('  None')

        return '\n'.join(lines)
