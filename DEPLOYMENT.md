# Deployment Guide - Keren Meair Vesure

## Prerequisites
- GitHub account
- Cloudflare account (free tier works)
- Git installed on your computer

## Step 1: Push to GitHub

### 1.1 Initialize Git Repository (if not already done)
```bash
git init
git add .
git commit -m "Initial commit"
```

### 1.2 Create GitHub Repository
1. Go to https://github.com/new
2. Create a new repository (name it `keren-meair-vesure` or similar)
3. **Don't** initialize with README, .gitignore, or license (you already have these)
4. Click "Create repository"

### 1.3 Push to GitHub
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## Step 2: Deploy to Cloudflare Pages

### 2.1 Connect to Cloudflare Pages
1. Go to https://dash.cloudflare.com/
2. Select "Workers & Pages" from the left menu
3. Click "Create application"
4. Click "Pages" tab
5. Click "Connect to Git"

### 2.2 Authorize GitHub
1. Click "Add account" and authorize Cloudflare to access your GitHub
2. Select your repository from the list

### 2.3 Configure Build Settings
Set the following:

**Project name:** `keren-meair-vesure` (or your choice)

**Production branch:** `main`

**Build command:** `npm run build`

**Build output directory:** `dist`

**Root directory:** `/` (leave empty)

**Environment variables:** (Leave empty - Supabase keys are already in the code)

### 2.4 Deploy
1. Click "Save and Deploy"
2. Wait 2-5 minutes for the build to complete
3. Your site will be live at `https://your-project-name.pages.dev`

## Step 3: Configure Custom Domain (Optional)

If you have a custom domain:

1. In Cloudflare Pages, go to your project
2. Click "Custom domains"
3. Click "Set up a custom domain"
4. Enter your domain name
5. Follow the DNS instructions

## Step 4: Future Updates

To deploy updates:

```bash
git add .
git commit -m "Description of changes"
git push
```

Cloudflare Pages will automatically rebuild and deploy your changes!

## Troubleshooting

### Build Fails
- Check the build logs in Cloudflare dashboard
- Make sure all dependencies are in `package.json`
- Verify `npm run build` works locally

### 404 on Routes
Cloudflare Pages supports SPA routing automatically. If you get 404s on refresh:
1. Create a `public/_redirects` file with:
   ```
   /*    /index.html   200
   ```

### Supabase Connection Issues
- Verify your Supabase project is accessible publicly
- Check Row Level Security (RLS) policies in Supabase
- Ensure the anon key is correct

## Security Notes

✅ **Safe to deploy:**
- Supabase URL (public)
- Supabase Anon Key (designed for client-side)

❌ **Never commit:**
- Supabase Service Role Key
- Private API keys
- Database credentials
- Admin passwords

## Performance Tips

- Cloudflare Pages includes automatic CDN
- Your assets are cached globally
- Consider enabling Cloudflare's caching rules
- Use Cloudflare Analytics (free) to monitor traffic

## Backup

Always maintain a local backup of your database! Export from Supabase regularly.
