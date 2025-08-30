# Tech Stack

## Context

Global tech stack defaults for Agent OS projects, overridable in project-specific `.agent-os/product/tech-stack.md`.

- App Framework: NextJS 15+ and NestJS 11+
- Language: Javascript
- Primary Database: Amazon RDS PostgreSQL 17+
- ORM: Prisma
- JavaScript Framework: React latest stable
- Build Tool: Webpack
- Import Strategy: Node.js modules
- Package Manager: npm
- Node Version: 22 LTS
- CSS Framework: TailwindCSS 4.0+
- UI Components: Instrumental Components latest
- UI Installation: Via development gems group
- Font Provider: Google Fonts
- Font Loading: Self-hosted for performance
- Icons: Lucide React components
- Application Hosting: AWS Amplify or AWS App Runner
- Hosting Region: Primary AWS region based on user base
- Database Hosting: Amazon RDS PostgreSQL
- Database Backups: Amazon RDS automated backups
- Asset Storage: Amazon S3
- CDN: Amazon CloudFront
- Asset Access: Private with CloudFront signed URLs
- CI/CD Platform: AWS CodePipeline + AWS CodeBuild
- CI/CD Trigger: Push to main/staging branches
- Tests: Run in CodeBuild before deployment
- Production Environment: main branch
- Staging Environment: staging branch
