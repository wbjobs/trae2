import sys
sys.stdout = open('test_motion.txt', 'w', encoding='utf-8')

from simulation.machine_model import MachineModel
from simulation import Simulator
from core.parser import GCodeParser
from config import load_config

config = load_config()
machine = MachineModel.from_config(config)
parser = GCodeParser()
commands = parser.parse_file('data/samples/sample_milling.nc')

# Check command 8
cmd8 = commands[8]
print(f'Command 8:')
print(f'  motion_type: {cmd8.motion_type.value}')
print(f'  explicit_axes: {cmd8.explicit_axes}')
print(f'  coordinates: {cmd8.coordinates}')
for a in ['X', 'Y', 'Z']:
    print(f'  has_explicit_axis("{a}"): {cmd8.has_explicit_axis(a)}')
    print(f'  coordinates["{a}"]: {cmd8.coordinates.get(a, "MISSING")}')

print()

sim = Simulator(machine)
sim.load_commands(commands)

# Check initial position
print(f'Initial position: {sim.current_position}')
print(f'Machine axis Z home: {machine.axes["Z"].home_position}')
print()

# Process commands 0-8 manually
for i in range(9):
    cmd = commands[i]
    mt = cmd.motion_type.value if hasattr(cmd.motion_type, 'value') else str(cmd.motion_type)
    print(f'Processing command {i}: {mt} explicit={cmd.explicit_axes}')
    result = sim.step()
    print(f'  After step {i+1}:')
    print(f'    current_command_index: {sim.current_command_index}')
    print(f'    position: {sim.current_position}')
    print(f'    result: {result}')
    print()

sys.stdout.close()
