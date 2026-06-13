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

## ระบบ Activity อัตโนมัติ

เวลาใกล้ 18:00 ฟังก์ชัน `createNextActivityDate()` จะตรวจทุกชีตที่ชื่อขึ้นต้นด้วย
`Activity ` ว่ามีวันที่พรุ่งนี้หรือยัง เช่น วันนี้ 12/6 จะตรวจหา 13/6/2026 หากชีตใด
ไม่มีบล็อกครบ 8 แถว ตั้งแต่เวลา 8:00-9:00 ถึง 15:00-16:00 จะเพิ่มบล็อกใหม่
ต่อจากแถวสุดท้ายทันที พร้อมคัดลอกรูปแบบและ dropdown ตีเส้นขอบทุกช่อง และไม่เติม
คำว่า `ว่าง`

เวลาใกล้ 20:00 ฟังก์ชัน `checkDailyActivityAndNotify()` จะตรวจทุกชีตที่ชื่อขึ้นต้น
ด้วย `Activity ` หากใครยังไม่มีงานจริงของวันนี้ ระบบจะส่งรายชื่อผ่าน LINE ไปยัง
user ID ที่กำหนดไว้ใน Script Properties

การตรวจความครบจะดูเฉพาะคอลัมน์ `งานที่ 1` ของทั้ง 8 ช่วงเวลา ช่องว่างถือว่าไม่ครบ
แต่คำว่า `ว่าง` และ `พักกลางวัน` ถือว่ากรอกข้อมูลแล้ว

ระบบจะไม่ส่ง LINE ในวันเสาร์ วันอาทิตย์ หรือวันที่พบในชีตชื่อ `วันหยุด` โดยสามารถ
ใส่วันที่รูปแบบ `d/m/yyyy` ไว้ในคอลัมน์ใดก็ได้ และใส่ชื่อวันหยุดไว้ในแถวเดียวกันได้
และจะไม่สร้างบล็อก Activity ใหม่ หากวันที่พรุ่งนี้เป็นวันเสาร์ วันอาทิตย์ หรือวันที่
ระบุไว้ในชีต `วันหยุด`

หลังนำโค้ดขึ้น Apps Script เวอร์ชันล่าสุดแล้ว ให้เลือกฟังก์ชัน
`installActivityTrigger` และกด Run หนึ่งครั้ง พร้อมยอมรับสิทธิ์เข้าถึง Google Sheets
ระบบจะติดตั้ง trigger ทั้งเวลา 18:00 และ 20:00 ตามเขตเวลา Asia/Bangkok และป้องกัน
การสร้างวันที่ซ้ำไว้แล้ว ต้องมีค่าเหล่านี้ใน Script Properties:

ให้รัน `installActivityTrigger` จากหน้า Apps Script โดยตรง ไม่จำเป็นต้องรันฟังก์ชัน
ที่ลงท้ายด้วย `Manual` ซึ่งมีไว้เรียกจากเมนูใน Google Sheets

| Property | Value |
| --- | --- |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel access token |
| `ACTIVITY_SPREADSHEET_ID` | รหัส Google Sheets จาก URL |
| `ACTIVITY_REPORT_LINE_USER_ID` | LINE user ID ผู้รับรายงาน |

เมื่อเปิด Google Sheets ใหม่ จะมีเมนู **Activity Tools** ด้านบน สามารถเลือก
**สร้างข้อมูลวันพรุ่งนี้** เพื่อสร้างแบบแมนนวล หรือเลือก **ติดตั้งทริกเกอร์ 18:00 / 20:00**
ได้จากในชีตโดยตรง หากเมนูยังไม่ปรากฏ ให้รีเฟรชหน้า Google Sheets หนึ่งครั้ง

ควรเปิด Apps Script จากไฟล์ชีตผ่าน **ส่วนขยาย > Apps Script** เพื่อให้สคริปต์ผูกกับ
ชีตนี้โดยตรง เมนูแบบแมนนวลจะใช้ชีตที่กำลังเปิดอยู่และไม่ต้องค้นหาไฟล์ผ่าน Drive
