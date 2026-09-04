# Vernier Sensor Quest

เว็บมินิเกมวิทยาศาสตร์ 2 เกมสำหรับนักเรียน

- **ภารกิจร้อน–เย็น** ใช้ Go Direct Temperature ทำภารกิจสั้น 10–16 วินาที เช่น อุ่นขึ้น เย็นลง และอยู่นิ่ง โดยไม่ต้องอ่านกราฟ
- **ทำท่าตามฉัน** ใช้ Go Direct Acceleration (แกน X/Y/Z) ให้เด็กเอียงหรือเขย่าตามภาพใหญ่ทีละท่า
- เล่นได้ทั้งเซนเซอร์จริงผ่าน Bluetooth/USB และโหมดจำลอง
- แต่ละเกมมี 5 ด่าน เรียงจากง่ายไปยาก พร้อมคู่มือและเฉลยหลังพลาด 3 ครั้ง
- รองรับหน้าจอมือถือและคอมพิวเตอร์

## เปิดใช้งานบนเครื่อง

ต้องมี Node.js 22 ขึ้นไป

```bash
npm install
npm run dev
```

เปิด URL ที่แสดงใน Terminal ด้วย Chrome หรือ Edge การเชื่อมต่อเซนเซอร์ต้องเปิดเว็บผ่าน HTTPS หรือ localhost

## นำขึ้น GitHub Pages

1. สร้าง Repository ใหม่ใน GitHub
2. อัปโหลดไฟล์ทั้งหมดขึ้น Repository
3. ไปที่ **Settings → Pages → Source** แล้วเลือก **GitHub Actions**
4. Push เข้า branch `main` ระบบจะ build และ deploy อัตโนมัติ

ไฟล์ workflow อยู่ที่ `.github/workflows/deploy-pages.yml`

## การเชื่อมต่อเซนเซอร์

เว็บใช้ไลบรารีทางการ `@vernier/godirect`

- Bluetooth ใช้ Web Bluetooth
- USB ใช้ WebHID
- แนะนำ Chrome หรือ Edge รุ่นปัจจุบัน
- iPhone/iPad และ Safari อาจไม่รองรับ Web Bluetooth โดยตรง ให้ใช้โหมดจำลองหรืออุปกรณ์ที่รองรับ
- หน้า Preview ภายในแชทเป็นเบราว์เซอร์ระยะไกล จึงไม่สามารถมองเห็น Bluetooth ของคอมพิวเตอร์ผู้ใช้ได้ ให้ทดสอบเซนเซอร์จริงจาก Chrome/Edge บนเครื่องที่มีเซนเซอร์

เมื่อใช้ GDX-ACC ให้วางเซนเซอร์ในท่าเริ่มต้นแล้วกด **Set zero acceleration** ก่อนเริ่มเกม

## คำสั่งสำคัญ

```bash
npm run dev          # เปิดเว็บสำหรับพัฒนา
npm run build        # ตรวจ production build
npm run build:github # สร้างเว็บแบบ static สำหรับ GitHub Pages
npm run lint         # ตรวจโค้ด
```
