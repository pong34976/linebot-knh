# LINE ID Bot with Google Apps Script

LINE bot สำหรับตอบ `userId`, `groupId` และ `roomId` ที่มากับ webhook event โดยใช้
Google Apps Script เป็น webhook และเก็บ source code บน GitHub ได้โดยไม่ต้องฝัง token
ไว้ใน repository

## 1. เปลี่ยน Channel access token ก่อน

Token ที่ส่งผ่านแชตหรือเคย commit ลง GitHub ควรถูก revoke แล้วออก token ใหม่ใน
LINE Developers Console ก่อนใช้งานจริง

## 2. สร้าง Apps Script

1. เปิด <https://script.google.com> แล้วสร้างโปรเจกต์ใหม่
2. นำ `Code.gs` และ `appsscript.json` ไปใส่ในโปรเจกต์
3. เปิด **Project Settings > Script Properties**
4. เพิ่ม property ต่อไปนี้

| Property | Value |
| --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel access token ตัวใหม่ |
| `WEBHOOK_SECRET` | ข้อความสุ่มยาว ๆ เช่น UUID ที่ตัดขีดออก |

รัน `setup()` หนึ่งครั้งได้เพื่อสร้าง `WEBHOOK_SECRET` อัตโนมัติ จากนั้นดูค่าที่
**Executions > Logs** ส่วน access token ให้ใส่ผ่าน Script Properties เท่านั้น

## 3. Deploy เป็น Web app

1. เลือก **Deploy > New deployment > Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Deploy แล้วคัดลอก URL ที่ลงท้ายด้วย `/exec`
5. ตั้ง Webhook URL ใน LINE Developers Console เป็น:

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?key=WEBHOOK_SECRET
```

กด **Verify**, เปิด **Use webhook** และปิดข้อความตอบกลับอัตโนมัติใน LINE Official
Account Manager เพื่อไม่ให้ตอบซ้ำกัน

ทุกครั้งที่แก้โค้ด ต้องสร้าง deployment version ใหม่หรือแก้ deployment ให้ใช้ version
ล่าสุด

## 4. วิธีใช้

เพิ่ม bot เป็นเพื่อน แล้วส่งคำใดคำหนึ่ง:

```text
id
my id
user id
ไอดี
ขอ id
ขอไอดี
```

ในแชตส่วนตัว bot จะตอบ `userId` ส่วนในกลุ่มจะตอบทั้ง `userId` และ `groupId`
ตามข้อมูลที่ LINE ส่งมาใน event

## GitHub ด้วย clasp (ทางเลือก)

ติดตั้งและล็อกอิน `clasp` จากเครื่องของคุณ จากนั้นสร้าง `.clasp.json` ในเครื่องโดยระบุ
`scriptId` ของโปรเจกต์ แล้วใช้ `clasp push` / `clasp pull` เพื่อ sync กับ Apps Script
ไฟล์ `.clasp.json` ถูก ignore ไว้เพื่อไม่เผยข้อมูลโปรเจกต์โดยไม่ตั้งใจ

## หมายเหตุด้านความปลอดภัย

Apps Script web app ไม่เปิด request headers ให้ `doPost(e)` ตรวจสอบ
`x-line-signature` ได้ตามแนวทางมาตรฐานของ LINE โครงนี้จึงใช้ `WEBHOOK_SECRET` ใน URL
ช่วยจำกัดการเรียก endpoint หากต้องการตรวจลายเซ็นเต็มรูปแบบ ควรใช้ GitHub สำหรับเก็บ
source code และ deploy webhook บน Cloud Run, Cloud Functions หรือบริการที่อ่าน headers ได้

## สร้างวันที่ใน Activity พงศ์พล ทุก 20:00

ฟังก์ชัน `createNextActivityDate()` จะสร้างข้อมูลของวันพรุ่งนี้จำนวน 8 แถวในชีต
`Activity พงศ์พล` โดยคัดลอกรูปแบบจากบล็อกล่าสุด ใส่เลขลำดับต่อเนื่อง ช่วงเวลา
08:00-16:00 ค่าเริ่มต้น `ว่าง` และ `พักกลางวัน` ในช่วง 12:00-13:00

หลังนำโค้ดขึ้น Apps Script เวอร์ชันล่าสุดแล้ว ให้เลือกฟังก์ชัน
`installActivityTrigger` และกด Run หนึ่งครั้ง พร้อมยอมรับสิทธิ์เข้าถึง Google Sheets
ระบบจะติดตั้ง trigger รายวันเวลาประมาณ 20:00 ตามเขตเวลา Asia/Bangkok และป้องกัน
การสร้างวันที่ซ้ำไว้แล้ว
