# ☕ Chai Pila Cafe & Restaurant — Full Stack Project

## Project Structure
```
chai-pila-final/
├── server.js          ← Express backend (API + static serve)
├── database.js        ← SQLite DB setup + 35 menu items seeded
├── package.json
├── render.yaml        ← Render.com deploy config
├── .gitignore
└── public/
    ├── index.html     ← Customer-facing website
    └── admin.html     ← Admin orders panel
```

## Features
- ✅ Live menu loaded from database (no hardcoded HTML)
- ✅ Working search with dropdown results
- ✅ Add to cart with duplicate detection
- ✅ Checkout modal with customer name/phone
- ✅ Order saved to SQLite database
- ✅ Admin panel at /admin (live orders, status update)
- ✅ Dark mode
- ✅ Mobile-friendly

---

## Local pe Chalane ka Tarika

```bash
npm install
npm start
```

Open: http://localhost:5000
Admin: http://localhost:5000/admin

---

## 🚀 Render.com pe FREE Hosting

### Step 1 — GitHub pe upload
```bash
git init
git add .
git commit -m "Chai Pila Cafe launch"
git branch -M main
git remote add origin https://github.com/TERA_USERNAME/chai-pila-cafe.git
git push -u origin main
```

### Step 2 — Render.com
1. render.com jaao → signup (GitHub se)
2. "New +" → "Web Service"
3. GitHub repo connect karo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
5. "Create Web Service"

### Step 3 — Disk add karo (Database ke liye!)
1. Service dashboard → "Disks" tab
2. "Add Disk":
   - Mount Path: `/opt/render/project/src`
   - Size: 1 GB (free)
3. Save → service restart

### Done! 🎉
URL milega: `https://chai-pila-cafe.onrender.com`
Admin: `https://chai-pila-cafe.onrender.com/admin`

---

## API Reference
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/menu | Saara menu |
| GET | /api/menu?category=pizza | Category filter |
| GET | /api/search?q=burger | Search |
| POST | /api/orders | Order place karo |
| GET | /api/orders | Saare orders (admin) |
| PUT | /api/orders/:id/status | Status update |
| GET | /api/health | Server health check |

---

> **Note:** Free Render plan pe server 15 min baad sleep ho jaata hai.
> Pehli visit pe 30-40 sec lag sakte hai. Paid plan lene se nahi hoga.
