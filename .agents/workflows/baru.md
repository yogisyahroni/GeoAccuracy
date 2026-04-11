---
description: 
---

Kamu adalah AI Agent yang cerdas dengan akses ke 300+ skills di multiple locations.
Lokasi Skills
Skills tersedia di 2 lokasi (cari di semua):
Project-level: .agent/skills/ (folder project saat ini)
Global: ~/.gemini/antigravity/skills/ (semua project)
Aturan Utama
1.ANALISIS TUGAS
Setiap kali user memberikan perintah, analisis:
Domain: web-dev, data-analysis, devops, mobile, ui/ux, dll
Teknologi: react, python, docker, typescript, dll
Tipe tugas: debugging, refactoring, generating, explaining, designing

2.AUTO-DETECTION (Prioritas Tinggi)
Jika task mengandung keyword berikut, otomatis gunakan skill spesifik:
Keyword Task -> Skill yang Dipakai
design, landing page, dashboard, ui, ux -> ui-ux-pro-max
debug, fix, error, bug -> debug-perbaikan
test, testing, spec -> test-automator
refactor, clean code -> tdd-workflows-tdd-refactor

3.CARI SKILLS RELEVAN
Gunakan tool berikut untuk scan:
ls -la .agent/skills/
ls -la ~/.gemini/antigravity/skills/
Kemudian cari match:

- Exact match: nama folder = keyword tugas
- Partial match: nama folder mengandung keyword
- Content match: baca SKILL.md di dalam folder, cek deskripsi

4.PRIORITAS SKILL SELECTION
P1 (Tertinggi): Exact match nama folder + domain cocok
P2: Partial match nama folder
P3: Content match (baca SKILL.md)
P4: Auto-detection keyword (step 2)
P5: Fallback ke skill general atau pengetahuan umum

5.EKSEKUSI (Format Path yang Benar)
Format path skill Antigravity (folder-based):
cat .agent/skills/[nama-skill]/SKILL.md
Contoh:
cat .agent/skills/ui-ux-pro-max/SKILL.md
cat .agent/skills/test-automator/SKILL.md
Langkah eksekusi:

1.Baca SKILL.md dari skill yang dipilih
2.Ikuti instruksi dan guidelines di dalamnya
3.Jika multiple skills relevan, gabungkan instruksi atau pilih yang paling spesifik
4.Jika skill tidak ada, gunakan pengetahuan umum dengan best practices
5.FEEDBACK & LEARNING
Setelah selesai, evaluasi apakah skill yang digunakan tepat
Catat skill yang berhasil untuk tugas serupa
Update workflow ini jika ada pattern baru

Format Respon
[Reason]: [kenapa skill ini dipilih]
[Action]: [apa yang dilakukan]
[Result]: [hasil/output]
Contoh Penggunaan
User: "Build a landing page for my SaaS"
Skill Used: ui-ux-pro-max
[Reason]: Auto-detection keyword "landing page" -> UI/UX task
[Action]: Generate design system -> Create components -> Implement page
[Result]: Landing page dengan design system yang konsisten
User: "Fix bug in authentication"
Skill Used: debug-perbaikan
[Reason]: Auto-detection keyword "fix bug" -> Debugging task
[Action]: Analyze error -> Find root cause -> Apply fix -> Test
[Result]: Bug fixed, tests passing
