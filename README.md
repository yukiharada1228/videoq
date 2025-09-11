# VideoQ

[![Django CI](https://github.com/yukiharada1228/videoq/actions/workflows/django.yml/badge.svg)](https://github.com/yukiharada1228/videoq/actions/workflows/django.yml)
[![Python](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Django](https://img.shields.io/badge/django-5.2.4-green.svg)](https://www.djangoproject.com/)

VideoQ is a web application for video management, sharing, and analysis. It leverages AI technology to automatically analyze video content and provides semantic search and RAG (Retrieval Augmented Generation) question-answering capabilities.

## 🚀 Key Features

### 📹 Video Management
- **Video Upload**: Support for multiple formats (MP4, AVI, MOV, etc.)
- **Video Groups**: Organize related videos into groups
- **Metadata Management**: Title, description, and tagging
- **Sharing Features**: Shareable URLs

### 🤖 AI Analysis Features
- **Automatic Transcription**: Speech recognition using OpenAI Whisper
- **Semantic Search**: Similar content discovery through vector search
- **RAG Question Answering**: Question answering based on video content
- **Related Question Generation**: Automatic question generation by AI

### 🔍 Search & Analysis
- **Full-text Search**: Search through transcribed text
- **Semantic Search**: Search by semantic similarity
- **Time-series Analysis**: Jump to specific times in videos
- **Content Analysis**: Automatic summarization of video content

### 👥 User Management
- **Authentication System**: Sign up, login, password reset
- **Access Control**: Concurrent access limits for shared URLs
- **BASIC Authentication**: Enable/disable control via environment variables

## 🏗️ Architecture

### Technology Stack
- **Web Framework**: Django 5.2.4
- **Database**: PostgreSQL
- **Vector Search**: OpenSearch (local) or Pinecone (cloud)
- **Asynchronous Processing**: Celery + Redis
- **Containerization**: Docker + Docker Compose
- **AI/ML**: OpenAI API (GPT-4o-mini, text-embedding-3-small)
- **Reverse Proxy**: Nginx

### System Configuration

#### Local Version (Default)
```
┌─────────────────┐    ┌─────────────────┐
│     Nginx       │───▶│   Django Web    │
│   (Port 8080)   │    │   (Port 8000)   │
└─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │◀───│     Redis       │◀───│    Celery       │
│   (Database)    │    │   (Cache/Queue) │    │    Worker       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenSearch    │    │   OpenAI API    │    │    Local        │
│   (Vector Search)│    │   (AI Analysis) │    │   (Video Storage)│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### AWS Production Environment (Terraform Configuration)

##### Infrastructure Configuration (2-stage Deployment)
```
┌─────────────────────────────────────────────────────────────┐
│                    Bootstrap Stack                         │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   S3 Bucket     │    │   DynamoDB      │                │
│  │   (Terraform    │    │   (State Lock)  │                │
│  │    State)       │    │                 │                │
│  └─────────────────┘    └─────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Production Stack                        │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   Route 53      │───▶│   ALB           │                │
│  │   (DNS)         │    │   (HTTPS/HTTP)  │                │
│  └─────────────────┘    └─────────┬───────┘                │
│                                   │                        │
│  ┌─────────────────────────────────▼─────────────────────┐  │
│  │              Public Subnets (2 AZs)                  │  │
│  │  ┌─────────────────┐    ┌─────────────────┐          │  │
│  │  │   ECS Fargate   │    │   ECS Fargate   │          │  │
│  │  │   ┌───────────┐ │    │   ┌───────────┐ │          │  │
│  │  │   │Web Service│ │    │   │Worker     │ │          │  │
│  │  │   │(Django)   │ │    │   │(Celery)   │ │          │  │
│  │  │   └───────────┘ │    │   └───────────┘ │          │  │
│  │  └─────────────────┘    └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                   │                        │
│  ┌─────────────────────────────────▼─────────────────────┐  │
│  │              Private Subnets (2 AZs)                 │  │
│  │  ┌─────────────────┐    ┌─────────────────┐          │  │
│  │  │   RDS           │    │   ElastiCache   │          │  │
│  │  │   PostgreSQL    │    │   Redis         │          │  │
│  │  │   (Database)    │    │   (Cache/Queue) │          │  │
│  │  └─────────────────┘    └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                   │                        │
│         ┌─────────────────────────┼─────────────────────┐  │
│         │                         │                     │  │
│ ┌───────▼───────┐    ┌───────────▼───────┐    ┌───────▼───────┐│
│ │   S3 Bucket   │    │   Pinecone        │    │   Mailgun     ││
│ │   (Video Storage)│    │   (Vector Search) │    │   (Email)     ││
│ └───────────────┘    └───────────────────┘    └───────────────┘│
│         │                         │                     │  │
│         └─────────────────────────┼─────────────────────┘  │
│                                   │                        │
│                     ┌─────────────▼───────┐                │
│                     │   ECR               │                │
│                     │   (Container)       │                │
│                     └─────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Setup Instructions

### 1. Prerequisites

#### Common Requirements
- Docker & Docker Compose
- OpenAI API Key

#### Local Version (Default)
- No additional requirements (uses local file system)

#### AWS Production Environment (Terraform Configuration)
- AWS CLI configured
- Terraform 1.3.0 or higher
- Domain name (managed by Route 53)
- Pinecone API Key
- Mailgun API Key

### 2. Clone Repository
```bash
git clone https://github.com/yukiharada1228/videoq.git
cd videoq
```

### 3. Environment Variables Configuration
Create a `.env` file and set the following values:

#### 🔐 Required Settings
```bash
# Django Settings
DJANGO_SECRET_KEY=your-secret-key-here

# OpenAI API (for video analysis and RAG features)
OPENAI_API_KEY=your-openai-api-key-here

# BASIC Authentication Settings
BASIC_AUTH_ENABLED=TRUE
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-basic-auth-password
```

#### 🔍 Vector Search Configuration
```bash
# Vector search provider (opensearch or pinecone)
VECTOR_SEARCH_PROVIDER=opensearch

# When using OpenSearch (default)
# No additional configuration required (auto-started with Docker Compose)

# When using Pinecone
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
```

#### 🗄️ Database Configuration
```bash
POSTGRES_PASSWORD=your-postgres-password
```

#### 🔒 BASIC Authentication Configuration
```bash
# Enable/disable BASIC authentication (default: TRUE)
BASIC_AUTH_ENABLED=TRUE
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-basic-auth-password
```

#### 🔐 Security Settings (Production Environment)
```bash
# HTTPS Settings
SECURE_SSL_REDIRECT=TRUE
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=TRUE
SECURE_HSTS_PRELOAD=TRUE

# Session and CSRF Settings
SESSION_COOKIE_SECURE=TRUE
SESSION_COOKIE_AGE=1209600
CSRF_COOKIE_SECURE=TRUE
```

**Note**: In production environments, these security settings are automatically applied when deploying with Terraform. For local development environments, add the above settings to your `.env` file.

#### 👤 Signup Control
```bash
# Enable/disable new user registration (default: TRUE)
SIGNUP_ENABLED=TRUE
```

#### 💾 File Storage Configuration

##### Local Version (Default, recommended for development)
```bash
# Local file storage
USE_S3=FALSE

# File storage locations
# - Static files: ./static/
# - Media files: ./media/
# - Video files: ./media/videos/
```

##### AWS Production Environment (Terraform Configuration)
```bash
# S3 file storage (automatically configured by Terraform)
USE_S3=TRUE
# AWS credentials are automatically managed by ECS task role
# S3 bucket name is automatically generated by Terraform
```

##### About Bootstrap Stack
The Bootstrap Stack creates the foundational resources needed for Terraform remote state management:
- **S3 Bucket**: For storing Terraform state files
- **DynamoDB Table**: For Terraform state locking
- **One-time execution**: Deploy once, then use for subsequent Production Stack deployments

##### About Subnet Configuration
The Production Stack uses the following subnet configuration:
- **Public Subnets (2 AZs)**: ECS Fargate services (Web and Worker) run here
  - Internet access via Internet Gateway
  - Automatic public IP address assignment
- **Private Subnets (2 AZs)**: RDS and ElastiCache run here
  - No internet access (enhanced security)
  - S3 access via VPC Endpoint


#### 📧 Email Configuration (Optional)
```bash
# When using Mailgun
USE_MAILGUN=TRUE
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_SENDER_DOMAIN=your-domain.com
DEFAULT_FROM_EMAIL=noreply@your-domain.com
```

#### ⚙️ Shared URL Access Control Settings
```bash
SHARE_ACCOUNT_MAX_CONCURRENT_USERS=30
SHARE_SESSION_TIMEOUT_MINUTES=10
REDIS_URL=redis://redis:6379/0
```

### 4. Start Docker Containers
```bash
# Start all services
docker compose up --build -d

# Check logs
docker compose logs -f
```

### 5. Initialize Database
```bash
# Apply migrations
docker compose exec web python manage.py migrate

# Create admin user (optional)
docker compose exec web python manage.py createsuperuser
```

### 6. Application Access
- **Main Application**: `http://localhost:8080`
- **OpenSearch Dashboard**: `http://localhost:5601`
- **Flower (Celery Monitoring)**: `http://localhost:5555`

## 📁 Project Structure

```
videoq/
├── app/                          # Main Application
│   ├── models.py                 # Data Models
│   ├── views.py                  # Views and APIs
│   ├── tasks.py                  # Celery Tasks
│   ├── middleware.py             # BASIC Authentication Middleware
│   ├── share_access_middleware.py # Shared Access Control
│   ├── base_vector_service.py    # Vector Search Base Class
│   ├── opensearch_service.py     # OpenSearch Implementation
│   ├── pinecone_service.py       # Pinecone Implementation
│   ├── vector_search_factory.py  # Vector Search Factory
│   ├── services.py               # Business Logic
│   ├── crypto_utils.py           # Encryption Utilities
│   └── templates/                # Templates
├── videoq/                       # Project Settings
│   ├── settings.py               # Django Settings
│   ├── urls.py                   # URL Configuration
│   └── celery.py                 # Celery Configuration
├── static/                       # Static Files (Local Version)
├── media/                        # Media Files (Local Version)
│   └── videos/                   # Video File Storage Location
├── docker-compose.yml            # Docker Compose Configuration
├── Dockerfile                    # Docker Image Configuration
├── nginx.conf                    # Nginx Configuration
├── requirements.txt              # Python Dependencies
└── infra/                        # Terraform Infrastructure Configuration
    ├── bootstrap/                # Bootstrap Stack (Terraform State Management)
    │   ├── main.tf              # S3 Bucket and DynamoDB Table
    │   ├── variables.tf         # Variable Definitions
    │   └── outputs.tf           # Output Definitions
    └── prod/                    # Production Stack (Application Infrastructure)
        ├── main.tf              # VPC and Network Configuration
        ├── ecs.tf               # ECS Cluster and Services
        ├── rds.tf               # RDS PostgreSQL
        ├── redis.tf             # ElastiCache Redis
        ├── s3.tf                # S3 Bucket
        ├── alb.tf               # Application Load Balancer
        ├── route53.tf           # DNS Configuration
        ├── secrets.tf           # Secrets Manager
        ├── iam.tf               # IAM Roles and Policies
        ├── security_groups.tf   # Security Groups
        ├── monitoring.tf        # CloudWatch Monitoring
        ├── backend.tf           # Terraform State Configuration
        ├── variables.tf         # Variable Definitions
        └── outputs.tf           # Output Definitions
```

### File Storage Locations

#### Local Version
- **Static Files**: `./static/`
- **Media Files**: `./media/`
- **Video Files**: `./media/videos/`

#### S3 Version
- **Static Files**: `static/` directory in S3 bucket
- **Media Files**: `media/` directory in S3 bucket
- **Video Files**: `media/videos/` directory in S3 bucket

## 🔧 Key Components

### Vector Search System
- **BaseVectorService**: Abstract base class providing common functionality
- **OpenSearchService**: Local OpenSearch implementation
- **PineconeService**: Cloud Pinecone implementation
- **VectorSearchFactory**: Provider selection via environment variables

### Video Processing Pipeline

#### Local Version
1. **Video Upload**: File validation and local storage (`./media/videos/`)
2. **Audio Extraction**: Audio separation using FFmpeg
3. **Transcription**: OpenAI Whisper API
4. **Chunking**: Segmentation by semantic units
5. **Vectorization**: OpenAI Embedding API
6. **Index Storage**: Vector search engine

#### S3 Version
1. **Video Upload**: File validation and S3 storage
2. **Audio Extraction**: Audio separation using FFmpeg
3. **Transcription**: OpenAI Whisper API
4. **Chunking**: Segmentation by semantic units
5. **Vectorization**: OpenAI Embedding API
6. **Index Storage**: Vector search engine

### Sharing System
- **ShareAccessMiddleware**: Concurrent access control
- **ShareAccessService**: Sharing logic
- **CryptoUtils**: URL encryption

## 🚀 Deployment

### Local Development (Local Storage Version)
```bash
# Start development environment (local file storage)
USE_S3=FALSE BASIC_AUTH_ENABLED=FALSE docker compose up --build -d
```

### AWS Production Environment (Terraform Configuration)

#### 1. Bootstrap Stack Deployment (First Time Only)
```bash
# Navigate to Bootstrap directory
cd infra/bootstrap

# Create terraform.tfvars file
cp terraform.tfvars.example terraform.tfvars
# Set values as needed (works with default values)

# Initialize Terraform
terraform init

# Review plan
terraform plan

# Deploy Bootstrap Stack
terraform apply

# Check output values (for use in prod later)
terraform output
```

#### 2. Production Stack Deployment
```bash
# Navigate to production environment directory
cd infra/prod

# Create terraform.tfvars file
cp terraform.tfvars.example terraform.tfvars
# Set required values (domain name, API keys, etc.)

# Initialize Terraform (using S3 bucket created by Bootstrap)
terraform init

# Review plan
terraform plan

# Deploy infrastructure
terraform apply
```

#### 3. Application Deployment
```bash
# Get ECR repository URL
aws ecr describe-repositories --repository-names videoq-prod-web

# Build and push Docker image
docker build -t videoq-prod-web .
docker tag videoq-prod-web:latest <ECR_URI>:latest
docker push <ECR_URI>:latest

# Update ECS service
aws ecs update-service --cluster videoq-prod --service videoq-prod-web --force-new-deployment
```

#### 4. Environment Variables and Secrets Management
- **Secrets Manager**: Sensitive information like passwords and API keys
- **ECS Task Definition**: Reference to environment variables and secrets
- **IAM Roles**: Access permissions for S3, RDS, ElastiCache

#### 5. Monitoring and Logging
- **CloudWatch Logs**: Application logs
- **CloudWatch Metrics**: Performance monitoring
- **ALB Health Checks**: Health checks


## 📊 Monitoring and Logging

### Log Checking
Logs are output to standard output, so they can be checked using Docker Compose log commands:

```bash
# All service logs
docker compose logs -f

# Specific service logs
docker compose logs -f web
docker compose logs -f worker

# Check by log level
docker compose logs -f web | grep ERROR
docker compose logs -f worker | grep INFO
```

### Log Format
Logs are output in JSON format and include the following information:
- `level`: Log level (INFO, WARNING, ERROR, etc.)
- `time`: Timestamp
- `module`: Module name
- `message`: Log message

### Health Checks

#### Local Environment
- **Application**: `http://localhost:8080/health/`
- **OpenSearch**: `http://localhost:5601`
- **Flower**: `http://localhost:5555`

#### AWS Production Environment
- **Application**: `https://your-domain.com/health/`
- **ALB Health Check**: `/health` endpoint
- **CloudWatch**: Metrics and log monitoring

## 🔒 Security

### Authentication and Authorization
- **BASIC Authentication**: Control via environment variables
- **Django Authentication**: User management
- **Shared Access Control**: Concurrent connection limits

### Data Protection
- **Encryption**: Shared URL encryption
- **Session Management**: Secure session settings
- **CSRF Protection**: Django standard CSRF protection

#### AWS Production Environment Security
- **VPC**: Separated configuration with public subnets (ECS) and private subnets (RDS, ElastiCache)
- **Security Groups**: Access control based on principle of least privilege
- **Secrets Manager**: Encrypted storage of sensitive information
- **RDS Encryption**: Database encryption at rest
- **S3 Encryption**: Object-level encryption
- **HTTPS**: SSL/TLS termination at ALB
