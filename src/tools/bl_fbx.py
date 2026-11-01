import os
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=os.environ.get('WALK_FBX', 'Walking.fbx'))
for o in bpy.data.objects:
    print('OBJ', o.name, o.type, tuple(round(v, 3) for v in o.dimensions), 'scale', tuple(round(v, 3) for v in o.scale))
    if o.type == 'ARMATURE': print('  bones', len(o.data.bones), [b.name for b in o.data.bones][:25])
    if o.type == 'MESH': print('  verts', len(o.data.vertices), 'mats', [m.name for m in o.data.materials])
for a in bpy.data.actions: print('ACT', a.name, a.frame_range[:], len(a.fcurves) if hasattr(a, 'fcurves') else '')
print('IMGS', [(i.name, i.size[:]) for i in bpy.data.images])
