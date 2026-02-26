# 🛡️ SOP v2: Cập nhật Antigravity Kit & Skills (An toàn Tuyệt đối)

> **Mục tiêu:** Cập nhật các tính năng mới nhất từ `vudovn/antigravity-kit` và `sickn33/antigravity-awesome-skills` nhưng bảo vệ 100% các Skill, Agent, Workflow, và Rules được người dùng tùy chỉnh (custom).

---

## 🚫 NGUYÊN TẮC VÀNG (P0)

1. **KHÔNG dùng lệnh `rm -rf .agent`**: Tuyệt đối không xóa trắng thư mục hệ thống.
2. **BACKUP VẬT LÝ TRƯỚC**: Luôn tạo bản sao `.agent/` trước mọi thao tác. Không dựa hoàn toàn vào Git để rollback.
3. **Ưu tiên `rsync` thay cho `cp`**: Sử dụng `rsync -av` (không có cờ `--delete`) để trộn file mới vào file cũ mà không xóa mất các file custom không có trong repo gốc.
4. **Bảo vệ file custom đã chỉnh sửa**: Dùng `--exclude` cho các file gốc mà sếp đã tùy chỉnh nội dung để tránh bị ghi đè.
5. **Bảo vệ Symlinks**: Luôn kiểm tra các thư mục đặc biệt (`docx`, `pdf`, `pptx`, `xlsx`) để chuyển chúng sang dạng symlink nếu bản update yêu cầu.
6. **Hậu kiểm Index**: Mọi skill trên ổ đĩa PHẢI có entry trong `skills_index.json`. Không được trùng lặp slug.
7. **Vệ sinh Index & Định dạng Skill**: Tuyệt đối không để xảy ra tình trạng trùng lặp bản ghi trong `skills_index.json`. Phải kiểm tra file `SKILL.md` để loại bỏ các nội dung lỗi (như log HTML, file rác hệ thống `.DS_Store`) trước khi index.

---

## 📋 QUY TRÌNH THỰC HIỆN (8 BƯỚC)

### Bước 1: Backup vật lý

> ⚠️ **Bắt buộc.** Đây là lưới an toàn chính, không phụ thuộc Git.

```bash
BACKUP_DIR="/tmp/antigravity_backup_$(date +%s)"
cp -r .agent "$BACKUP_DIR"
echo "✅ Backup tại: $BACKUP_DIR"
```

### Bước 2: Quét và Định danh Tài sản Custom

Xác định các file/folder do sếp tự tạo hoặc đã chỉnh sửa so với repo gốc. Lưu kết quả vào `/tmp/custom_assets.txt`:

```bash
# Liệt kê agents custom
ls .agent/agents/ > /tmp/custom_agents.txt

# Liệt kê workflows custom
ls .agent/workflows/ > /tmp/custom_workflows.txt

# Liệt kê rules custom
ls .agent/rules/ > /tmp/custom_rules.txt

# Liệt kê skills custom (folder)
ls .agent/skills/ > /tmp/custom_skills.txt
```

**Quan trọng:** AI phải hỏi sếp xác nhận danh sách file nào sếp đã **tùy chỉnh nội dung** (ví dụ: sửa `frontend-specialist.md`) để thêm vào danh sách `--exclude` ở Bước 4.

**Tạo checksum cho file custom đã chỉnh sửa** (để xác minh nội dung sau update):

```bash
# Lưu checksum nội dung các file custom quan trọng
# AI hỏi sếp file nào đã custom, sau đó chạy:
md5 .agent/agents/ios-mod-specialist.md >> /tmp/custom_checksums.txt  # ví dụ
md5 .agent/workflows/mod-ios.md >> /tmp/custom_checksums.txt         # ví dụ
# Thêm các file custom khác mà sếp xác nhận...
```

> Checksum này dùng ở Tầng 1 Testing để xác minh **nội dung** file custom không bị ghi đè, thay vì chỉ kiểm tra tên file.

### Bước 3: Chuẩn bị vùng đệm (Staging)

```bash
mkdir -p /tmp/antigravity_update/kit /tmp/antigravity_update/skills
git clone https://github.com/vudovn/antigravity-kit /tmp/antigravity_update/kit
git clone https://github.com/sickn33/antigravity-awesome-skills /tmp/antigravity_update/skills
```

### Bước 4: Cập nhật Core (Antigravity Kit)

```bash
# Cập nhật file root của .agent/ (ARCHITECTURE.md, skills_index.json, v.v.)
# Chỉ copy file, không đệ quy vào thư mục con. Loại trừ file custom như UPDATE_SOP.md
rsync -av --exclude='UPDATE_SOP.md' --exclude='tasks/' \
  /tmp/antigravity_update/kit/.agent/*.md .agent/
rsync -av /tmp/antigravity_update/kit/.agent/*.json .agent/ 2>/dev/null || true

# Cập nhật scripts (Ghi đè bản mới nhất, scripts không cần custom)
rsync -av /tmp/antigravity_update/kit/.agent/scripts/ .agent/scripts/

# Cập nhật Agents (Chỉ thêm/cập nhật, không xóa file custom)
# Thêm --exclude cho các agent mà sếp đã tùy chỉnh nội dung
rsync -av /tmp/antigravity_update/kit/.agent/agents/ .agent/agents/

# Cập nhật Workflows
rsync -av /tmp/antigravity_update/kit/.agent/workflows/ .agent/workflows/

# Cập nhật Rules
rsync -av /tmp/antigravity_update/kit/.agent/rules/ .agent/rules/
```

> **Lưu ý:** Nếu sếp đã chỉnh sửa agent gốc (ví dụ: `frontend-specialist.md`), thêm cờ:
> `rsync -av --exclude='frontend-specialist.md' ...`

### Bước 5: Cập nhật Bộ Skill (Awesome Skills)

**5.1. Sync folder skills:**

```bash
rsync -av /tmp/antigravity_update/skills/skills/ .agent/skills/
```

**5.2. Xử lý Symlinks:**

Xóa thư mục thực `docx`, `pdf`, `pptx`, `xlsx` (nếu chúng là folder thường) và thay bằng symlink trỏ đến bản `-official`:

```bash
cd .agent/skills/
for name in docx pdf pptx xlsx; do
  if [ -d "$name" ] && [ ! -L "$name" ]; then
    rm -rf "$name"
    ln -s "${name}-official" "$name"
  fi
done
cd ../..
```

**5.3. Merge Index:**

Viết script Python inline hoặc dùng file script:

```python
import json, os, shutil

def merge_index(current_path, new_path):
    # Nếu file index hiện tại chưa tồn tại → copy trực tiếp từ repo mới
    if not os.path.exists(current_path):
        shutil.copy2(new_path, current_path)
        with open(current_path, 'r') as f:
            data = json.load(f)
        print(f"✅ Tạo mới index với {len(data)} entries.")
        return

    with open(current_path, 'r') as f:
        current = json.load(f)
    with open(new_path, 'r') as f:
        new = json.load(f)

    existing_slugs = {s['slug'] for s in current if 'slug' in s}
    added = 0
    for s in new:
        if 'slug' in s and s['slug'] not in existing_slugs:
            current.append(s)
            existing_slugs.add(s['slug'])
            added += 1

    with open(current_path, 'w') as f:
        json.dump(current, f, indent=2, ensure_ascii=False)
    print(f"✅ Merged index: +{added} new entries. Total: {len(current)}")

merge_index('.agent/skills_index.json', '/tmp/antigravity_update/skills/skills_index.json')
```

> **⚠️ Key là `slug`, KHÔNG phải `id`.** File `skills_index.json` sử dụng cấu trúc `{"slug", "path", "description"}`.

### Bước 6: Đồng bộ Folder ↔ Index (Critical)

> Bước này bắt buộc để tránh skill "mồ côi" — có folder trên đĩa nhưng AI không thể gọi.

```python
import json, os

def sync_folders_to_index(index_path, skills_dir):
    with open(index_path, 'r') as f:
        data = json.load(f)

    existing_slugs = {s['slug'] for s in data if 'slug' in s}
    folders = [f for f in os.listdir(skills_dir)
               if os.path.isdir(os.path.join(skills_dir, f)) and not f.startswith('.')]
    added = 0
    for folder in folders:
        if folder not in existing_slugs:
            skill_md = os.path.join(skills_dir, folder, 'SKILL.md')
            desc = "Custom skill"
            if os.path.exists(skill_md):
                with open(skill_md, 'r') as f:
                    content = f.read(500)
                    if 'description:' in content:
                        try:
                            desc = content.split('description:')[1].split('\n')[0].strip()
                        except:
                            pass
            data.append({
                "slug": folder,
                "path": f".agent/skills/{folder}/SKILL.md",
                "description": desc
            })
            added += 1

    # Kiểm tra trùng lặp
    slugs = [s['slug'] for s in data if 'slug' in s]
    dupes = set([s for s in slugs if slugs.count(s) > 1])
    if dupes:
        print(f"⚠️ Phát hiện slug trùng lặp: {dupes}")
        seen = set()
        deduped = []
        for s in data:
            if s.get('slug') not in seen:
                deduped.append(s)
                seen.add(s.get('slug'))
        data = deduped
        print(f"✅ Đã loại bỏ trùng lặp.")

    with open(index_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ Sync folders → index: +{added} entries. Total: {len(data)}")

sync_folders_to_index('.agent/skills_index.json', '.agent/skills')
```

### Bước 7: Cập nhật ARCHITECTURE.md

Tự động đếm và ghi trực tiếp vào file `ARCHITECTURE.md`:

```bash
SKILL_COUNT=$(ls -1d .agent/skills/*/ 2>/dev/null | wc -l | tr -d ' ')
AGENT_COUNT=$(ls -1 .agent/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
WORKFLOW_COUNT=$(ls -1 .agent/workflows/*.md 2>/dev/null | wc -l | tr -d ' ')
MASTER_SCRIPTS=$(ls -1 .agent/scripts/*.py 2>/dev/null | wc -l | tr -d ' ')
SKILL_SCRIPTS=$(find .agent/skills -name "*.py" -o -name "*.sh" 2>/dev/null | wc -l | tr -d ' ')

echo "📊 Agents: $AGENT_COUNT | Skills: $SKILL_COUNT | Workflows: $WORKFLOW_COUNT"
echo "📜 Scripts: $MASTER_SCRIPTS (master) + $SKILL_SCRIPTS (skill-level)"

# Tự động cập nhật bảng Statistics trong ARCHITECTURE.md bằng sed
ARCH_FILE=".agent/ARCHITECTURE.md"
sed -i '' "s/| \*\*Total Agents\*\*.*|/| **Total Agents**    | $AGENT_COUNT                            |/" "$ARCH_FILE"
sed -i '' "s/| \*\*Total Skills\*\*.*|/| **Total Skills**    | $SKILL_COUNT                           |/" "$ARCH_FILE"
sed -i '' "s/| \*\*Total Workflows\*\*.*|/| **Total Workflows** | $WORKFLOW_COUNT                            |/" "$ARCH_FILE"
sed -i '' "s/| \*\*Total Scripts\*\*.*|/| **Total Scripts**   | $MASTER_SCRIPTS (master) + $SKILL_SCRIPTS (skill-level) |/" "$ARCH_FILE"

# Cập nhật con số trong phần Overview và Directory Structure
sed -i '' "s/\*\*[0-9]* Skills\*\*/**$SKILL_COUNT Skills**/" "$ARCH_FILE"
sed -i '' "s/Skills ([0-9]*)/Skills ($SKILL_COUNT)/" "$ARCH_FILE"
sed -i '' "s/# [0-9]* Skills/# $SKILL_COUNT Skills/" "$ARCH_FILE"
sed -i '' "s/# [0-9]* Specialist Agents/# $AGENT_COUNT Specialist Agents/" "$ARCH_FILE"

echo "✅ Đã tự động cập nhật ARCHITECTURE.md"
```

> **Lưu ý macOS:** Dùng `sed -i ''` (có dấu ngoặc rỗng). Trên Linux dùng `sed -i` (không có ngoặc).

### Bước 8: Dọn dẹp

```bash
rm -rf /tmp/antigravity_update
echo "✅ Đã xóa staging area."
```

---

## 🧪 QUY TRÌNH KIỂM THỬ (3 TẦNG)

### Tầng 1: Integrity Test (Tính toàn vẹn)

- So sánh danh sách file custom (từ Bước 2) với trạng thái hiện tại.
- **Kiểm tra tên file:** `diff /tmp/custom_agents.txt <(ls .agent/agents/)` → file custom phải còn.
- **Kiểm tra nội dung** (nếu đã tạo checksum ở Bước 2):
  ```bash
  # So sánh checksum trước và sau update
  md5 .agent/agents/ios-mod-specialist.md  # so với giá trị trong /tmp/custom_checksums.txt
  ```
  Nếu checksum thay đổi → file đã bị ghi đè → cần rollback file đó từ backup.

### Tầng 2: Index Sync & Format Test (Bộ nhớ AI)

- **Kiểm tra trùng lặp:**

  ```python
  import json
  with open('.agent/skills_index.json') as f:
      data = json.load(f)
  slugs = [s['slug'] for s in data]
  dupes = [s for s in slugs if slugs.count(s) > 1]
  assert not dupes, f"❌ Duplicate slugs: {set(dupes)}"
  print("✅ Không có slug trùng lặp.")
  ```

- **Khớp folder ↔ index:**

  ```python
  import json, os
  with open('.agent/skills_index.json') as f:
      data = json.load(f)
  index_slugs = {s['slug'] for s in data}
  folder_slugs = {f for f in os.listdir('.agent/skills') if os.path.isdir(f'.agent/skills/{f}') and not f.startswith('.')}
  orphans = folder_slugs - index_slugs
  assert not orphans, f"❌ Folder thiếu index: {orphans}"
  print(f"✅ Tất cả {len(folder_slugs)} folder đều có trong index.")
  ```

- **Kiểm tra định dạng:** Quét file `SKILL.md` để đảm bảo là Markdown hợp lệ, không chứa HTML lỗi hoặc `.DS_Store`.

### Tầng 3: Functional Test (Vận hành)

- Chạy `python3 .agent/scripts/checklist.py .` (nếu có lỗi `python` → dùng `python3`).
- Thử gọi một skill mới (ví dụ: `nextjs-react-expert`) để xác nhận AI đã nạp được kiến thức mới.

---

## 🚨 ROLLBACK (2 Tầng)

### Tầng 1: Rollback nhanh (Git)

```bash
git checkout -- .agent/
```

> ⚠️ Chỉ hoạt động nếu `.agent/` được Git track và có commit gần nhất.

### Tầng 2: Rollback toàn diện (Backup vật lý)

```bash
# Tìm backup mới nhất
LATEST_BACKUP=$(ls -td /tmp/antigravity_backup_* | head -1)
rm -rf .agent
cp -r "$LATEST_BACKUP" .agent
echo "✅ Đã khôi phục từ backup: $LATEST_BACKUP"
```

> Đây là phương án cuối cùng, luôn hoạt động bất kể trạng thái Git.

---

## 📝 CHANGELOG

| Version | Ngày       | Thay đổi                                                                                |
| ------- | ---------- | --------------------------------------------------------------------------------------- |
| v1      | 2025-02-xx | Bản gốc                                                                                 |
| v2      | 2026-02-25 | Thêm backup vật lý, sửa key `id`→`slug`, thêm sync folder↔index, dedup, rollback 2 tầng |
