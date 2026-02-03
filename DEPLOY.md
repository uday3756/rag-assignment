# Deploy: GitHub + Vercel

## 1. Push to GitHub

**Option A – Create repo on GitHub first**

1. Go to [github.com/new](https://github.com/new).
2. Repository name: `rag-assignment` (or any name).
3. Leave it empty (no README, no .gitignore).
4. Create repository.
5. In your project folder run (replace `YOUR_USERNAME` with your GitHub username):

```bash
cd C:\Users\unti\rag-assignment
git remote add origin https://github.com/YOUR_USERNAME/rag-assignment.git
git push -u origin main
```

**Option B – GitHub CLI**

If you have [GitHub CLI](https://cli.github.com/) installed and logged in:

```bash
cd C:\Users\unti\rag-assignment
gh repo create rag-assignment --public --source=. --push
```

## 2. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (e.g. with GitHub).
2. **Add New** → **Project**.
3. Import the **rag-assignment** repository (or the repo you pushed to).
4. **Root Directory:** click **Edit**, set to `web`, then **Continue**.
5. **Environment Variables:** add:
   - Name: `OPENAI_API_KEY`  
   - Value: your OpenAI API key  
   (Add for Production, Preview, Development if you want.)
6. Click **Deploy**.
7. When it finishes, open the generated URL (e.g. `https://rag-assignment-xxx.vercel.app`).

## 3. Preview locally (optional)

```bash
cd C:\Users\unti\rag-assignment\web
npm install
# Create .env.local with OPENAI_API_KEY=your_key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).
