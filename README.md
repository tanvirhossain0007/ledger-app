# Customer Ledger & Cash Flow App — Deploy Guide

এই ফোল্ডারটা একটা সম্পূর্ণ, রান-করা যায় এমন React (Vite) প্রজেক্ট। এখন `localStorage` ব্যবহার করে, তাই এটা যেকোনো নরমাল static hosting-এ কাজ করবে (Claude লাগবে না)।

## ধাপ ১ — লোকালে টেস্ট করা (ঐচ্ছিক কিন্তু recommended)

তোমার কম্পিউটারে [Node.js](https://nodejs.org) ইনস্টল থাকতে হবে (v18+)। তারপর টার্মিনালে:

```bash
cd ledger-app
npm install
npm run dev
```

এটা একটা লোকাল লিংক দেবে (যেমন `http://localhost:5173`) — ব্রাউজারে খুলে টেস্ট করো।

## ধাপ ২ — Production build বানানো

```bash
npm run build
```

এটা একটা `dist/` ফোল্ডার তৈরি করবে — এই ফোল্ডারের ভেতরের ফাইলগুলোই হলো তোমার ফাইনাল ওয়েবসাইট (HTML, CSS, JS)। **যেকোনো static hosting-এ শুধু এই `dist` ফোল্ডারের ভেতরের জিনিস আপলোড করলেই হবে।**

## ধাপ ৩ — ফ্রি হোস্টিং (সবচেয়ে সহজ থেকে শুরু)

### Option A: Netlify Drop (ইনস্টল ছাড়াই, সবচেয়ে সহজ)
1. https://app.netlify.com/drop এ যাও
2. `npm run build` করার পর তৈরি হওয়া `dist` ফোল্ডারটা সরাসরি ব্রাউজারে drag & drop করো
3. সাথে সাথে একটা লাইভ লিংক পাবে (ফ্রি) — যেমন `random-name.netlify.app`

### Option B: Vercel (GitHub দিয়ে, অটো-ডিপ্লয়)
1. কোডটা একটা GitHub repo-তে পুশ করো
2. https://vercel.com এ গিয়ে GitHub দিয়ে সাইন আপ করো
3. "New Project" → তোমার repo সিলেক্ট করো
4. Vercel নিজে থেকেই Vite প্রজেক্ট ধরে ফেলবে (Build command: `npm run build`, Output: `dist`)
5. Deploy চাপো — কয়েক মিনিটে লাইভ লিংক পাবে, প্রতিবার GitHub-এ push করলে অটো re-deploy হবে

### Option C: GitHub Pages (ফ্রি, GitHub-এই থাকে)
1. `vite.config.js`-এ `base: '/your-repo-name/'` যোগ করো
2. `npm run build` করো, `dist` ফোল্ডারের কনটেন্ট `gh-pages` ব্রাঞ্চে পুশ করো (অথবা `gh-pages` npm প্যাকেজ ব্যবহার করো)
3. Repo Settings → Pages থেকে enable করো

## গুরুত্বপূর্ণ নোট

- ডেটা এখন ব্রাউজারের `localStorage`-এ থাকে — মানে **প্রতিটা ব্যবহারকারীর ডেটা তার নিজের ব্রাউজারেই আলাদা থাকবে**, কারো সাথে শেয়ার হবে না। এটা আগের Claude ভার্সনের চেয়ে ভালো প্রাইভেসি, কিন্তু এখন Admin আর Customer একসাথে একই ব্রাউজারে লগইন করলেই একে অপরের ডেটা দেখতে পাবে (যেহেতু কোনো real backend/database নেই)।
- ব্রাউজার ক্যাশ/history clear করলে ডেটা মুছে যাবে — এটা প্রোডাকশন ব্যবহারের জন্য যথেষ্ট না, শুধু ডেমো/প্রোটোটাইপের জন্য ঠিক আছে।
- সত্যিকারের multi-user সিস্টেম (আলাদা আলাদা কাস্টমার তাদের নিজের ডেটা দেখবে, সবার ডেটা এক জায়গায় থাকবে) চাইলে একটা real backend (Node/Express বা PHP) + ডাটাবেস (PostgreSQL/MySQL) দরকার হবে — এটা এখনো সেটা না।

## Login (Demo)

- Admin: username `admin`, password `admin123`
