import numpy as np
from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, List, Tuple, Callable
from enum import Enum
import logging
import time

logger = logging.getLogger(__name__)


class ValidationLevel(Enum):
    DISABLED = "disabled"
    BASIC = "basic"
    STANDARD = "standard"
    STRICT = "strict"


class ValidationSeverity(Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class ValidationResult:
    check_name: str
    passed: bool
    severity: ValidationSeverity
    message: str = ""
    actual_value: float = 0.0
    expected_range: Tuple[float, float] = (0.0, 0.0)
    details: Dict = field(default_factory=dict)


@dataclass
class ValidationReport:
    timestamp: float = field(default_factory=time.time)
    results: List[ValidationResult] = field(default_factory=list)
    total_checks: int = 0
    passed_checks: int = 0
    failed_checks: int = 0
    has_errors: bool = False
    has_warnings: bool = False
    
    def add_result(self, result: ValidationResult) -> None:
        self.results.append(result)
        self.total_checks += 1
        if result.passed:
            self.passed_checks += 1
        else:
            self.failed_checks += 1
            if result.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL]:
                self.has_errors = True
            if result.severity == ValidationSeverity.WARNING:
                self.has_warnings = True
    
    def get_errors(self) -> List[ValidationResult]:
        return [r for r in self.results if not r.passed 
                and r.severity in [ValidationSeverity.ERROR, ValidationSeverity.CRITICAL]]
    
    def get_warnings(self) -> List[ValidationResult]:
        return [r for r in self.results if not r.passed 
                and r.severity == ValidationSeverity.WARNING]
    
    def to_dict(self) -> Dict:
        return {
            'timestamp': self.timestamp,
            'total_checks': self.total_checks,
            'passed_checks': self.passed_checks,
            'failed_checks': self.failed_checks,
            'has_errors': self.has_errors,
            'has_warnings': self.has_warnings,
            'results': [
                {
                    'check_name': r.check_name,
                    'passed': r.passed,
                    'severity': r.severity.value,
                    'message': r.message,
                    'actual_value': r.actual_value,
                    'expected_range': list(r.expected_range)
                }
                for r in self.results
            ]
        }


@dataclass
class ValidationThresholds:
    max_velocity: float = 100.0
    max_force: float = 1.0e6
    max_energy_growth: float = 10.0
    min_time_step_ratio: float = 0.1
    max_cfl_number: float = 0.5
    max_overlap_ratio: float = 0.1
    energy_conservation_tolerance: float = 0.05
    momentum_conservation_tolerance: float = 0.01


class SimulationValidator:
    def __init__(
        self,
        level: ValidationLevel = ValidationLevel.STANDARD,
        thresholds: Optional[ValidationThresholds] = None
    ):
        self.level = level
        self.thresholds = thresholds or ValidationThresholds()
        self.history: List[Dict] = []
        self._initial_energy: Optional[float] = None
        self._initial_momentum: Optional[np.ndarray] = None
        
        self._checks = self._register_checks()
    
    def _register_checks(self) -> Dict[str, Callable]:
        checks = {
            'particle_velocity': self._check_particle_velocity,
            'particle_force': self._check_particle_force,
            'time_step_stability': self._check_time_step_stability,
            'energy_conservation': self._check_energy_conservation,
            'momentum_conservation': self._check_momentum_conservation,
            'particle_overlap': self._check_particle_overlap,
            'energy_growth': self._check_energy_growth,
        }
        
        if self.level in [ValidationLevel.STANDARD, ValidationLevel.STRICT]:
            checks.update({
                'domain_bounds': self._check_domain_bounds,
                'cfl_condition': self._check_cfl_condition,
            })
        
        if self.level == ValidationLevel.STRICT:
            checks.update({
                'symmetry_check': self._check_symmetry,
                'divergence_check': self._check_divergence,
            })
        
        return checks
    
    def set_initial_state(self, state) -> None:
        self._initial_energy = state.energy_kinetic + state.energy_potential
        self._initial_momentum = self._calculate_total_momentum(state.particle_data)
        self.history.clear()
    
    def _calculate_total_momentum(self, particle_data) -> np.ndarray:
        masses = particle_data.masses.reshape(-1, 1)
        velocities = particle_data.velocities
        return np.sum(masses * velocities, axis=0)
    
    def validate_step(self, state, step: int) -> ValidationReport:
        report = ValidationReport()
        
        if self.level == ValidationLevel.DISABLED:
            return report
        
        for check_name, check_func in self._checks.items():
            try:
                result = check_func(state, step)
                if result:
                    report.add_result(result)
            except Exception as e:
                logger.warning(f"Validation check '{check_name}' failed: {e}")
        
        self._record_state(state, step)
        
        return report
    
    def _record_state(self, state, step: int) -> None:
        self.history.append({
            'step': step,
            'time': state.current_time,
            'energy_kinetic': state.energy_kinetic,
            'energy_potential': state.energy_potential,
            'energy_total': state.energy_kinetic + state.energy_potential,
        })
    
    def _check_particle_velocity(self, state, step: int) -> Optional[ValidationResult]:
        velocities = state.particle_data.velocities
        speeds = np.linalg.norm(velocities, axis=1)
        max_speed = np.max(speeds)
        
        passed = max_speed < self.thresholds.max_velocity
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING if max_speed < 2 * self.thresholds.max_velocity \
                       else ValidationSeverity.ERROR
        
        return ValidationResult(
            check_name='particle_velocity',
            passed=passed,
            severity=severity,
            message=f"Max particle velocity: {max_speed:.2e} m/s",
            actual_value=max_speed,
            expected_range=(0.0, self.thresholds.max_velocity)
        )
    
    def _check_particle_force(self, state, step: int) -> Optional[ValidationResult]:
        forces = state.particle_data.forces
        force_mags = np.linalg.norm(forces, axis=1)
        max_force = np.max(force_mags) if len(force_mags) > 0 else 0.0
        
        passed = max_force < self.thresholds.max_force
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.ERROR
        
        return ValidationResult(
            check_name='particle_force',
            passed=passed,
            severity=severity,
            message=f"Max particle force: {max_force:.2e} N",
            actual_value=max_force,
            expected_range=(0.0, self.thresholds.max_force)
        )
    
    def _check_time_step_stability(self, state, step: int) -> Optional[ValidationResult]:
        if step < 2:
            return None
        
        dt = state.current_time / step if step > 0 else 0
        
        particle_data = state.particle_data
        diameters = particle_data.diameters
        masses = particle_data.masses
        young_modulus = 7.0e10
        poisson_ratio = 0.25
        
        if len(diameters) == 0:
            return None
        
        r_eff = diameters / 2.0
        m_eff = masses / 2.0
        contact_stiffness = (4.0 / 3.0) * np.sqrt(0.5) * young_modulus / (1 - poisson_ratio**2) * np.sqrt(r_eff)
        
        max_stiffness = float(np.nanmax(contact_stiffness))
        min_mass = float(np.min(m_eff))
        
        min_period = 2 * np.pi * np.sqrt(min_mass / max_stiffness)
        min_time_step = min_period / 20
        time_step_ratio = float(dt / min_time_step)
        
        passed = time_step_ratio < self.thresholds.min_time_step_ratio
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING if time_step_ratio < 1.0 else ValidationSeverity.ERROR
        
        return ValidationResult(
            check_name='time_step_stability',
            passed=passed,
            severity=severity,
            message=f"Time step ratio: {time_step_ratio:.3f}",
            actual_value=time_step_ratio,
            expected_range=(0.0, self.thresholds.min_time_step_ratio)
        )
    
    def _check_energy_conservation(self, state, step: int) -> Optional[ValidationResult]:
        if self._initial_energy is None or self._initial_energy == 0:
            return None
        
        total_energy = state.energy_kinetic + state.energy_potential
        energy_ratio = abs(total_energy - self._initial_energy) / self._initial_energy
        
        passed = energy_ratio < self.thresholds.energy_conservation_tolerance
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING
        
        return ValidationResult(
            check_name='energy_conservation',
            passed=passed,
            severity=severity,
            message=f"Energy conservation error: {energy_ratio*100:.2f}%",
            actual_value=energy_ratio,
            expected_range=(0.0, self.thresholds.energy_conservation_tolerance)
        )
    
    def _check_momentum_conservation(self, state, step: int) -> Optional[ValidationResult]:
        if self._initial_momentum is None:
            return None
        
        current_momentum = self._calculate_total_momentum(state.particle_data)
        initial_mag = np.linalg.norm(self._initial_momentum)
        
        if initial_mag < 1e-10:
            return None
        
        momentum_error = np.linalg.norm(current_momentum - self._initial_momentum) / initial_mag
        
        passed = momentum_error < self.thresholds.momentum_conservation_tolerance
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING
        
        return ValidationResult(
            check_name='momentum_conservation',
            passed=passed,
            severity=severity,
            message=f"Momentum conservation error: {momentum_error*100:.2f}%",
            actual_value=momentum_error,
            expected_range=(0.0, self.thresholds.momentum_conservation_tolerance)
        )
    
    def _check_particle_overlap(self, state, step: int) -> Optional[ValidationResult]:
        positions = state.particle_data.positions
        diameters = state.particle_data.diameters
        n = len(positions)
        
        if n < 2:
            return None
        
        max_overlap_ratio = 0.0
        
        for i in range(min(n, 100)):
            for j in range(i + 1, min(n, 100)):
                dist = np.linalg.norm(positions[i] - positions[j])
                min_dist = (diameters[i] + diameters[j]) / 2.0
                
                if dist < min_dist:
                    overlap = min_dist - dist
                    overlap_ratio = overlap / min_dist
                    max_overlap_ratio = max(max_overlap_ratio, overlap_ratio)
        
        passed = max_overlap_ratio < self.thresholds.max_overlap_ratio
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING if max_overlap_ratio < 0.5 else ValidationSeverity.ERROR
        
        return ValidationResult(
            check_name='particle_overlap',
            passed=passed,
            severity=severity,
            message=f"Max particle overlap: {max_overlap_ratio*100:.1f}%",
            actual_value=max_overlap_ratio,
            expected_range=(0.0, self.thresholds.max_overlap_ratio)
        )
    
    def _check_energy_growth(self, state, step: int) -> Optional[ValidationResult]:
        if self._initial_energy is None or self._initial_energy == 0:
            return None
        
        total_energy = state.energy_kinetic + state.energy_potential
        energy_ratio = total_energy / self._initial_energy
        
        passed = energy_ratio < self.thresholds.max_energy_growth
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.CRITICAL
        
        return ValidationResult(
            check_name='energy_growth',
            passed=passed,
            severity=severity,
            message=f"Energy growth ratio: {energy_ratio:.1f}x",
            actual_value=energy_ratio,
            expected_range=(0.0, self.thresholds.max_energy_growth)
        )
    
    def _check_domain_bounds(self, state, step: int) -> Optional[ValidationResult]:
        from .config import SimulationConfig
        
        positions = state.particle_data.positions
        
        config = getattr(state, 'config', None)
        if config is None:
            return None
        
        bounds_min = np.array([config.domain.x_min, config.domain.y_min, config.domain.z_min])
        bounds_max = np.array([config.domain.x_max, config.domain.y_max, config.domain.z_max])
        radii = state.particle_data.diameters / 2.0
        
        outside_count = 0
        for i in range(len(positions)):
            pos = positions[i]
            r = radii[i]
            if np.any(pos - r < bounds_min) or np.any(pos + r > bounds_max):
                outside_count += 1
        
        outside_ratio = outside_count / len(positions) if len(positions) > 0 else 0
        
        passed = outside_ratio < 0.01
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING if outside_ratio < 0.1 else ValidationSeverity.ERROR
        
        return ValidationResult(
            check_name='domain_bounds',
            passed=passed,
            severity=severity,
            message=f"Particles outside domain: {outside_ratio*100:.1f}%",
            actual_value=outside_ratio,
            expected_range=(0.0, 0.01)
        )
    
    def _check_cfl_condition(self, state, step: int) -> Optional[ValidationResult]:
        velocities = state.particle_data.velocities
        speeds = np.linalg.norm(velocities, axis=1)
        max_speed = np.max(speeds) if len(speeds) > 0 else 0
        
        diameters = state.particle_data.diameters
        min_diameter = np.min(diameters) if len(diameters) > 0 else 1.0
        
        dt = state.current_time / step if step > 0 else 0
        
        if max_speed > 0 and min_diameter > 0:
            cfl = max_speed * dt / min_diameter
        else:
            cfl = 0.0
        
        passed = cfl < self.thresholds.max_cfl_number
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING
        
        return ValidationResult(
            check_name='cfl_condition',
            passed=passed,
            severity=severity,
            message=f"CFL number: {cfl:.3f}",
            actual_value=cfl,
            expected_range=(0.0, self.thresholds.max_cfl_number)
        )
    
    def _check_symmetry(self, state, step: int) -> Optional[ValidationResult]:
        if step % 100 != 0:
            return None
        
        positions = state.particle_data.positions
        velocities = state.particle_data.velocities
        
        center = np.mean(positions, axis=0)
        centred_pos = positions - center
        
        vel_magnitude = np.linalg.norm(velocities, axis=1)
        symmetry_score = np.std(vel_magnitude) / (np.mean(vel_magnitude) + 1e-10)
        
        passed = symmetry_score < 0.5
        
        return ValidationResult(
            check_name='symmetry_check',
            passed=passed,
            severity=ValidationSeverity.INFO,
            message=f"Velocity symmetry score: {symmetry_score:.3f}",
            actual_value=symmetry_score,
            expected_range=(0.0, 0.5)
        )
    
    def _check_divergence(self, state, step: int) -> Optional[ValidationResult]:
        if len(self.history) < 10:
            return None
        
        recent_energies = [h['energy_total'] for h in self.history[-10:]]
        if len(recent_energies) < 2:
            return None
        
        energy_diff = np.diff(recent_energies)
        divergence_trend = np.all(energy_diff > 0) and len(energy_diff) >= 5
        
        passed = not divergence_trend
        
        severity = ValidationSeverity.INFO
        if not passed:
            severity = ValidationSeverity.WARNING
        
        return ValidationResult(
            check_name='divergence_check',
            passed=passed,
            severity=severity,
            message="Energy is continuously increasing" if not passed else "Energy stable",
            actual_value=float(not passed),
            expected_range=(0.0, 0.5)
        )
    
    def final_validation(self, state) -> ValidationReport:
        report = ValidationReport()
        
        if len(self.history) > 1:
            energies = [h['energy_total'] for h in self.history]
            energy_std = np.std(energies)
            energy_mean = np.mean(energies)
            energy_variation = energy_std / (energy_mean + 1e-10)
            
            report.add_result(ValidationResult(
                check_name='final_energy_stability',
                passed=energy_variation < 0.1,
                severity=ValidationSeverity.WARNING if energy_variation >= 0.1 else ValidationSeverity.INFO,
                message=f"Overall energy variation: {energy_variation*100:.1f}%",
                actual_value=energy_variation,
                expected_range=(0.0, 0.1)
            ))
        
        report.add_result(ValidationResult(
            check_name='simulation_completion',
            passed=state.current_step >= state.total_steps,
            severity=ValidationSeverity.ERROR if state.current_step < state.total_steps else ValidationSeverity.INFO,
            message=f"Completed {state.current_step}/{state.total_steps} steps",
            actual_value=state.current_step,
            expected_range=(state.total_steps, state.total_steps)
        ))
        
        return report


def print_validation_report(report: ValidationReport) -> None:
    print("\n" + "=" * 60)
    print("Validation Report")
    print("=" * 60)
    print(f"Total checks: {report.total_checks}")
    print(f"Passed: {report.passed_checks}")
    print(f"Failed: {report.failed_checks}")
    
    if report.has_warnings:
        print("\nWarnings:")
        for w in report.get_warnings():
            print(f"  [!] {w.check_name}: {w.message}")
    
    if report.has_errors:
        print("\nErrors:")
        for e in report.get_errors():
            print(f"  [X] {e.check_name}: {w.message}")
    
    print("=" * 60)
