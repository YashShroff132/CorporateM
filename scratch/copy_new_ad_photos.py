import os
import shutil

src_dir = r"C:\Users\DELL\Desktop\ooo\ooo_ads_new\ooo ads"
dst_dir = r"c:\Users\DELL\tshirts\public\products"

copy_map = {
    "file_00000000064c8208bbf618ecf4fa8d75.png": "notice-period-energy-ad-1.png",
    "file_00000000f170820898ffcb9a80632478.png": "notice-period-energy-ad-2.png",
    "file_000000006b0881fabe75ca3c20c5ee85.png": "notice-period-energy-ad-3.png",
    "file_000000000ff88208935816104388c114.png": "delegator-ad-1.png",
    "file_00000000cef882088eb150ee8a93bad9.png": "delegator-ad-2.png",
    "file_00000000ee4081f5a640acedb3925875.png": "delegator-ad-3.png",
    "file_00000000498082118245bc3a04dd65f5.png": "good-team-manager-ad.png",
    "file_0000000065b88208a72b96c6de948d93.png": "quick-call-ad.png",
    "file_000000006db881faaade137d75002d59.png": "mute-is-my-crown-ad.png",
    "file_00000000a49481f4918319f06886c77a.png": "sorry-late-claude-ad.png",
    "file_00000000a59881f49c37fdac970015ef.png": "wfh-over-wfo-ad.png",
    "file_00000000ab2c820b98422fe7898455ea.png": "9am-standups-toxic-ad.png",
    "file_00000000c4dc82088c8b127ea58a8ebe.png": "happy-friday-white-ad.png",
}

for src_name, dst_name in copy_map.items():
    src_path = os.path.join(src_dir, src_name)
    dst_path = os.path.join(dst_dir, dst_name)
    shutil.copy2(src_path, dst_path)
    print(f"Copied {src_name} -> {dst_name}")

print("Copy completed successfully!")
