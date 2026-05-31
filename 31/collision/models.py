import math
from dataclasses import dataclass, field
from typing import List, Tuple, Optional


@dataclass
class BoundingBox:
    center: Tuple[float, float, float] = (0, 0, 0)
    size: Tuple[float, float, float] = (1, 1, 1)

    @property
    def min_corner(self) -> Tuple[float, float, float]:
        return (
            self.center[0] - self.size[0] / 2,
            self.center[1] - self.size[1] / 2,
            self.center[2] - self.size[2] / 2
        )

    @property
    def max_corner(self) -> Tuple[float, float, float]:
        return (
            self.center[0] + self.size[0] / 2,
            self.center[1] + self.size[1] / 2,
            self.center[2] + self.size[2] / 2
        )

    def contains_point(self, point: Tuple[float, float, float]) -> bool:
        mn = self.min_corner
        mx = self.max_corner
        return (mn[0] <= point[0] <= mx[0] and
                mn[1] <= point[1] <= mx[1] and
                mn[2] <= point[2] <= mx[2])

    def distance_to_point(self, point: Tuple[float, float, float]) -> float:
        mn = self.min_corner
        mx = self.max_corner
        dx = max(mn[0] - point[0], 0, point[0] - mx[0])
        dy = max(mn[1] - point[1], 0, point[1] - mx[1])
        dz = max(mn[2] - point[2], 0, point[2] - mx[2])
        return math.sqrt(dx * dx + dy * dy + dz * dz)

    def intersects_box(self, other: 'BoundingBox') -> bool:
        mn1, mx1 = self.min_corner, self.max_corner
        mn2, mx2 = other.min_corner, other.max_corner
        return (mn1[0] <= mx2[0] and mx1[0] >= mn2[0] and
                mn1[1] <= mx2[1] and mx1[1] >= mn2[1] and
                mn1[2] <= mx2[2] and mx1[2] >= mn2[2])


@dataclass
class Cylinder:
    center: Tuple[float, float, float] = (0, 0, 0)
    radius: float = 1.0
    length: float = 1.0
    axis: str = 'Z'

    def contains_point(self, point: Tuple[float, float, float]) -> bool:
        if self.axis == 'Z':
            radial_dist = math.sqrt(
                (point[0] - self.center[0]) ** 2 +
                (point[1] - self.center[1]) ** 2
            )
            within_radius = radial_dist <= self.radius
            within_length = (self.center[2] - self.length / 2 <= point[2] <=
                             self.center[2] + self.length / 2)
            return within_radius and within_length
        elif self.axis == 'X':
            radial_dist = math.sqrt(
                (point[1] - self.center[1]) ** 2 +
                (point[2] - self.center[2]) ** 2
            )
            within_radius = radial_dist <= self.radius
            within_length = (self.center[0] - self.length / 2 <= point[0] <=
                             self.center[0] + self.length / 2)
            return within_radius and within_length
        else:
            radial_dist = math.sqrt(
                (point[0] - self.center[0]) ** 2 +
                (point[2] - self.center[2]) ** 2
            )
            within_radius = radial_dist <= self.radius
            within_length = (self.center[1] - self.length / 2 <= point[1] <=
                             self.center[1] + self.length / 2)
            return within_radius and within_length

    def distance_to_point(self, point: Tuple[float, float, float]) -> float:
        if self.axis == 'Z':
            radial_dist = math.sqrt(
                (point[0] - self.center[0]) ** 2 +
                (point[1] - self.center[1]) ** 2
            )
            radial_distance = max(0, radial_dist - self.radius)
            half_len = self.length / 2
            length_distance = max(
                0, abs(point[2] - self.center[2]) - half_len
            )
            return math.sqrt(radial_distance ** 2 + length_distance ** 2)
        elif self.axis == 'X':
            radial_dist = math.sqrt(
                (point[1] - self.center[1]) ** 2 +
                (point[2] - self.center[2]) ** 2
            )
            radial_distance = max(0, radial_dist - self.radius)
            half_len = self.length / 2
            length_distance = max(
                0, abs(point[0] - self.center[0]) - half_len
            )
            return math.sqrt(radial_distance ** 2 + length_distance ** 2)
        else:
            radial_dist = math.sqrt(
                (point[0] - self.center[0]) ** 2 +
                (point[2] - self.center[2]) ** 2
            )
            radial_distance = max(0, radial_dist - self.radius)
            half_len = self.length / 2
            length_distance = max(
                0, abs(point[1] - self.center[1]) - half_len
            )
            return math.sqrt(radial_distance ** 2 + length_distance ** 2)

    def distance_to_cylinder(self, other: 'Cylinder') -> float:
        centers_distance = math.sqrt(
            (self.center[0] - other.center[0]) ** 2 +
            (self.center[1] - other.center[1]) ** 2 +
            (self.center[2] - other.center[2]) ** 2
        )
        return max(0, centers_distance - self.radius - other.radius)


@dataclass
class CollisionVolume:
    shapes: List = field(default_factory=list)
    label: str = ''

    def add_box(self, center: Tuple[float, float, float], size: Tuple[float, float, float]):
        self.shapes.append(BoundingBox(center=center, size=size))

    def add_cylinder(self, center: Tuple[float, float, float], radius: float,
                     length: float, axis: str = 'Z'):
        self.shapes.append(Cylinder(center=center, radius=radius, length=length, axis=axis))

    def contains_point(self, point: Tuple[float, float, float]) -> bool:
        return any(shape.contains_point(point) for shape in self.shapes)

    def distance_to_point(self, point: Tuple[float, float, float]) -> float:
        if not self.shapes:
            return float('inf')
        return min(shape.distance_to_point(point) for shape in self.shapes)
