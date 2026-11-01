import os
import bpy, mathutils, sys
SRC_FBX = os.environ.get('WALK_FBX', 'Walking.fbx')  # Mixamo 걷기 동작
blend = sys.argv[sys.argv.index('--') + 1]; out = sys.argv[sys.argv.index('--') + 2]
ATLAS = os.environ.get('PACK_ATLAS', 'atlas.png')
bpy.ops.wm.open_mainfile(filepath=blend)
T = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
print('constraints:', [(pb.name, [c.type for c in pb.constraints]) for pb in T.pose.bones if pb.constraints])
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=SRC_FBX)
new = [o for o in bpy.data.objects if o not in before]
S = [o for o in new if o.type == 'ARMATURE'][0]
src_act = S.animation_data.action
P = 'mixamorig:'
MAP = {'Body': 'Hips', 'Abdomen': 'Spine', 'Torso': 'Spine2', 'Neck': 'Neck', 'Head': 'Head',
       'Shoulder.L': 'LeftShoulder', 'UpperArm.L': 'LeftArm', 'LowerArm.L': 'LeftForeArm',
       'Shoulder.R': 'RightShoulder', 'UpperArm.R': 'RightArm', 'LowerArm.R': 'RightForeArm',
       'Foot.L': 'LeftFoot', 'Foot.R': 'RightFoot'}
MAP = {k: P + v for k, v in MAP.items() if k in T.pose.bones and P + v in S.pose.bones}
LOC = {'Body', 'Foot.L', 'Foot.R'}
scn = bpy.context.scene
# 쉬는 자세(T자)의 월드 기준 행렬
def rest_world(arm, name): return arm.matrix_world @ arm.data.bones[name].matrix_local
Srest = {t: rest_world(S, s) for t, s in MAP.items()}
Trest = {t: rest_world(T, t) for t in MAP}
s = (T.matrix_world @ T.data.bones['Body'].head_local).z / (S.matrix_world @ S.data.bones[P + 'Hips'].head_local).z
f0, f1 = int(src_act.frame_range[0]), int(src_act.frame_range[1])
# 발자국이 앞으로 나아가는 만큼 빼서 제자리 걷기로
def hips_w(f): scn.frame_set(f); return (S.matrix_world @ S.pose.bones[P + 'Hips'].matrix).translation.copy()
h0, h1 = hips_w(f0), hips_w(f1)
drift = mathutils.Vector((h1.x - h0.x, h1.y - h0.y, 0))
print('scale', round(s, 3), 'drift', drift)
T.animation_data_create()
act = bpy.data.actions.new('WalkHuman'); act.use_fake_user = True; T.animation_data.action = act
order = [b.name for b in T.data.bones if b.name in MAP]  # 부모가 먼저
for pb in T.pose.bones: pb.rotation_mode = 'QUATERNION'
for f in range(f0, f1 + 1):
    scn.frame_set(f)
    k = (f - f0) / max(1, (f1 - f0))
    for tname in order:
        sname = MAP[tname]
        sw = S.matrix_world @ S.pose.bones[sname].matrix
        R = sw.to_quaternion() @ Srest[tname].to_quaternion().inverted() @ Trest[tname].to_quaternion()
        pb = T.pose.bones[tname]
        if tname in LOC:
            d = (sw.translation - Srest[tname].translation) - drift * k
            pos = Trest[tname].translation + d * s
        else:
            bpy.context.view_layer.update(); pos = (T.matrix_world @ pb.matrix).translation
        pb.matrix = T.matrix_world.inverted() @ mathutils.Matrix.LocRotScale(pos, R, None)
        bpy.context.view_layer.update()
        pb.keyframe_insert('rotation_quaternion', frame=f - f0 + 1)
        if tname in LOC: pb.keyframe_insert('location', frame=f - f0 + 1)
for o in new: bpy.data.objects.remove(o, do_unlink=True)
bpy.data.actions.remove(src_act)
# 재질에 색상표 다시 연결 (기존 내보내기와 같게)
atlas = bpy.data.images.load(ATLAS, check_existing=True)
for mt in bpy.data.materials:
    mt.use_nodes = True; nt = mt.node_tree
    for nd in list(nt.nodes): nt.nodes.remove(nd)
    o_ = nt.nodes.new('ShaderNodeOutputMaterial'); b_ = nt.nodes.new('ShaderNodeBsdfPrincipled'); t_ = nt.nodes.new('ShaderNodeTexImage')
    t_.image = atlas; t_.interpolation = 'Closest'; b_.inputs['Metallic'].default_value = 0; b_.inputs['Roughness'].default_value = 0.8
    nt.links.new(t_.outputs['Color'], b_.inputs['Base Color']); nt.links.new(b_.outputs['BSDF'], o_.inputs['Surface'])
T.animation_data.action = None
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS', export_yup=True)
print('exported', out, [a.name for a in bpy.data.actions])
