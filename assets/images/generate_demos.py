"""Reproducible technical stereo test scenes, not photographs.

Requires Python, Pillow and NumPy. Parallel pinhole cameras, separate ray/depth
tests for each eye, and off-axis projection yield geometric horizontal parallax
with occlusions. No optical lens profile or viewer calibration is encoded.
"""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 720, 540
FOCAL = HEIGHT / (2 * math.tan(math.radians(52) / 2))
BASELINE = 0.10
CONVERGENCE = 5.5
OUT = Path(__file__).resolve().parent


def hashed(x, y):
    return np.mod(np.sin(x * 127.1 + y * 311.7) * 43758.5453, 1)


def eye_view(eye, scene):
    yy, xx = np.mgrid[:HEIGHT, :WIDTH]
    direction = np.stack(((xx + 0.5 - WIDTH / 2) / FOCAL - eye / CONVERGENCE,
                          -(yy + 0.5 - HEIGHT / 2) / FOCAL,
                          np.ones_like(xx)), axis=-1)
    origin = np.array([eye, 0.0, 0.0])
    light = np.array([-0.5, 0.8, -0.7])
    light /= np.linalg.norm(light)
    # Back wall at z=10: deterministic irregular tiles anchor stereo matches.
    distance = np.full((HEIGHT, WIDTH), 10.0)
    wall = origin + direction * distance[..., None]
    cell_x = np.floor(wall[..., 0] / 0.43)
    cell_y = np.floor(wall[..., 1] / 0.43)
    shade = hashed(cell_x, cell_y)
    wall_color = np.stack((0.085 + shade * 0.09, 0.12 + shade * 0.1, 0.19 + shade * 0.13), axis=-1)
    grout = (np.mod(wall[..., 0], 0.43) < 0.018) | (np.mod(wall[..., 1], 0.43) < 0.018)
    wall_color[grout] *= 0.6
    color = wall_color
    # Ground plane: depth-dependent texture and contact shadows.
    t_floor = np.divide(-1.38, direction[..., 1], out=np.full((HEIGHT, WIDTH), 1e6), where=direction[..., 1] < 0)
    floor = origin + direction * t_floor[..., None]
    floor_mask = (t_floor > 0) & (t_floor < distance)
    checker = (np.floor(floor[..., 0] * 2) + np.floor(floor[..., 2] * 2)) % 2
    floor_color = np.stack((0.17 + checker * 0.055, 0.23 + checker * 0.07, 0.28 + checker * 0.085), axis=-1)
    floor_color *= np.clip(1.1 - floor[..., 2:3] / 25, 0.5, 1)
    color[floor_mask] = floor_color[floor_mask]
    distance[floor_mask] = t_floor[floor_mask]

    if scene == 1:
        spheres = [((-1.08, -0.33, 3.65), 0.64, (1.0, 0.34, 0.26)),
                   ((0.86, -0.57, 5.85), 0.64, (0.29, 0.64, 1.0)),
                   ((-0.4, 0.68, 7.1), 0.46, (0.75, 0.56, 1.0))]
        boxes = [((0.25, -0.73, 3.08), (1.08, 0.25, 4.12), (0.24, 0.9, 0.71)),
                 ((-2.02, -1.38, 6.6), (-1.04, 0.02, 7.58), (1.0, 0.78, 0.27))]
    else:
        spheres = [((-0.8, 0.58, 3.2), 0.42, (0.33, 0.89, 0.77)),
                   ((0.24, -0.15, 4.95), 0.72, (0.96, 0.7, 0.24)),
                   ((1.54, 0.47, 7.2), 0.56, (0.61, 0.48, 1.0)),
                   ((-1.58, -0.6, 6.5), 0.63, (0.34, 0.66, 1.0))]
        boxes = [((0.74, -1.37, 3.25), (1.15, -0.35, 3.68), (1.0, 0.39, 0.41)),
                 ((-0.86, -1.37, 7.05), (-0.33, -0.28, 7.56), (0.6, 0.83, 0.36))]

    def paint(t, normals, base, modulation=1):
        nonlocal distance, color
        mask = (t > 0.05) & (t < distance)
        diffuse = np.clip(np.sum(normals * light, axis=-1), 0, 1)
        material = np.array(base) * (0.28 + 0.72 * diffuse[..., None]) * modulation
        color[mask] = material[mask]
        distance[mask] = t[mask]

    for center, radius, base in spheres:
        center = np.array(center)
        delta = origin - center
        a = np.sum(direction * direction, axis=-1)
        b = 2 * np.sum(direction * delta, axis=-1)
        c = np.dot(delta, delta) - radius * radius
        discriminant = b * b - 4 * a * c
        t = (-b - np.sqrt(np.maximum(discriminant, 0))) / (2 * a)
        t[discriminant < 0] = 1e6
        point = origin + direction * t[..., None]
        normal = (point - center) / radius
        latitude = (np.floor((point[..., 1] - center[1]) * 12) % 5 == 0)
        modulation = np.where(latitude, 0.73, 1.0)[..., None]
        paint(t, normal, base, modulation)

    for lower, upper, base in boxes:
        lower, upper = np.array(lower), np.array(upper)
        safe_direction = np.where(np.abs(direction) < 1e-8, 1e-8, direction)
        ta, tb = (lower - origin) / safe_direction, (upper - origin) / safe_direction
        near = np.minimum(ta, tb)
        far = np.maximum(ta, tb)
        t = np.max(near, axis=-1)
        t[t > np.min(far, axis=-1)] = 1e6
        axis = np.argmax(near, axis=-1)
        normals = np.zeros_like(direction)
        for dimension in range(3):
            normals[..., dimension] = np.where(axis == dimension, -np.sign(direction[..., dimension]), 0)
        point = origin + direction * t[..., None]
        # Small irregular squares on each face supply non-repeating local detail.
        tile = hashed(np.floor(point[..., 0] * 10) + np.floor(point[..., 2] * 10) * 7,
                      np.floor(point[..., 1] * 10))
        modulation = (0.83 + tile * 0.17)[..., None]
        paint(t, normals, base, modulation)

    color = np.clip(color, 0, 1)
    # Linear to display gamma; no real camera or optical calibration implied.
    result = Image.fromarray((np.power(color, 1 / 2.2) * 255).astype('uint8'), 'RGB')
    draw = ImageDraw.Draw(result)
    draw.rounded_rectangle((18, 18, 292, 70), radius=10, fill=(10, 18, 31))
    draw.text((30, 27), f'DEMO TECNICA SINTETICA {scene}', fill=(112, 235, 200), font=ImageFont.load_default(size=15))
    draw.text((30, 49), 'Full-SBS / geometria 3D / no fotografia', fill=(195, 209, 227), font=ImageFont.load_default(size=11))
    draw.text((22, HEIGHT - 28), 'L' if eye < 0 else 'R', fill=(255, 255, 255), font=ImageFont.load_default(size=17))
    return result


if __name__ == '__main__':
    for scene in (1, 2):
        stereo = Image.new('RGB', (WIDTH * 2, HEIGHT))
        stereo.paste(eye_view(-BASELINE / 2, scene), (0, 0))
        stereo.paste(eye_view(BASELINE / 2, scene), (WIDTH, 0))
        destination = OUT / f'demo-sbs-{scene}.jpg'
        stereo.save(destination, quality=93, subsampling=0, optimize=True)
        print(destination.name, destination.stat().st_size, 'bytes')
