#!/usr/bin/env python3
"""从 build/icon.png 生成商店 logo 与 AppX 磁贴资源。
用法：E:/Python/3.14/python.exe scripts/gen-store-logos.py
"""
import os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
icon = Image.open(os.path.join(root, "build", "icon.png")).convert("RGBA")
appx = os.path.join(root, "build", "appx")
os.makedirs(appx, exist_ok=True)


def save_square(size, path):
    icon.resize((size, size), Image.LANCZOS).save(path, "PNG")
    print(f"{os.path.relpath(path, root)}  {size}x{size}")


# Store 列表页 logo（300×300）
save_square(300, os.path.join(root, "store-assets", "store-logo-300.png"))

# AppX 磁贴（electron-builder 会从 build/appx/ 读取并覆盖默认占位图）
save_square(50, os.path.join(appx, "StoreLogo.png"))
save_square(44, os.path.join(appx, "Square44x44Logo.png"))
save_square(150, os.path.join(appx, "Square150x150Logo.png"))
save_square(310, os.path.join(appx, "Square310x310Logo.png"))

# 宽磁贴 310×150：深色底 + 居中图标
bg = Image.new("RGBA", (310, 150), (45, 45, 45, 255))
small = icon.resize((130, 130), Image.LANCZOS)
bg.alpha_composite(small, ((310 - 130) // 2, (150 - 130) // 2))
wide_path = os.path.join(appx, "Wide310x150Logo.png")
bg.save(wide_path, "PNG")
print(f"{os.path.relpath(wide_path, root)}  310x150")

print("done")
