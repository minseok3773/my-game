import os
import bpy, os
ATLAS = os.environ.get('PACK_ATLAS', 'atlas.png')  # Pirate Kit 색상표 png
OUT = os.environ.get('OUT_DIR', 'models')
SRC = os.environ.get('PACK_DIR', 'blend/')  # .blend 파일이 있는 폴더
files = {'henry': '11dae8a0-Characters_Henry.blend', 'captain': '86c38c34-Characters_Captain_Barbarossa.blend', 'mako': 'bee68375-Characters_Mako.blend', 'sharky': '96ed1b92-Characters_Sharky.blend', 'shark': '82851e5e-Characters_Shark.blend'}
for name, f in files.items():
    bpy.ops.wm.open_mainfile(filepath=SRC + f)
    for img in bpy.data.images:
        if img.name.startswith('Atlas_Pirate'):
            print(name, 'image', img.name, img.filepath, 'packed' if img.packed_file else 'external', img.size[:])
            if not img.packed_file:
                img.filepath = ATLAS; img.reload()
    # 색상표 이미지를 기본 재질(Principled BSDF)의 바탕색에 다시 연결
    atlas = bpy.data.images.load(ATLAS, check_existing=True)
    for mt in bpy.data.materials:
        if not mt.use_nodes: mt.use_nodes = True
        nt = mt.node_tree
        for nd in list(nt.nodes): nt.nodes.remove(nd)
        out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled'); tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = atlas; tex.interpolation = 'Closest'
        bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    # 렌더용 참고 사진 같은 불필요한 이미지는 내보내지 않음
    for o in bpy.data.objects:
        o.hide_set(False); o.hide_viewport = False; o.hide_render = False
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_animations=True,
                              export_animation_mode='ACTIONS', export_apply=False, export_yup=True, export_image_format='AUTO')
    print(name, os.path.getsize(os.path.join(OUT, name + '.glb')))
