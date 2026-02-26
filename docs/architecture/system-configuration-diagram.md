# System Configuration Diagram

## Overview

This diagram shows VideoQ's overall architecture and the default (Docker Compose) configuration.

## Overall System Configuration

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser["Web Browser
        Chrome, Firefox, Safari, etc."]
    end

    subgraph Gateway["Gateway Layer"]
        Nginx["Nginx Reverse Proxy
        Port: 80
        - Reverse Proxy
        - Static File Delivery
        - Load Balancing"]
    end

    subgraph Application["Application Layer"]
        subgraph Frontend["Frontend"]
            FrontendSPA["Vite + React SPA
            Port: 80 (container)
            - React
            - TypeScript
            - React Router
            - TanStack Query"]
        end

        subgraph Backend["Backend"]
            Django["Django REST API
            Port: 8000
            - Django 5.2.7+
            - DRF
            - Gunicorn"]
        end

        subgraph Worker["Worker"]
            Celery["Celery Worker
            - Asynchronous Task Processing
            - Transcription Processing"]
        end
    end

    subgraph Data["Data Layer"]
        PostgreSQL[("PostgreSQL 17
        + pgvector
        - Structured Data
        - Vector Data")]
        Redis[("Redis Alpine
        - Task Queue
        - Cache")]
    end

    subgraph Storage["Storage Layer"]
        LocalFS["Local File System
        /backend/media
        - Video Files
        - Static Files"]
        S3["AWS S3 / Cloudflare R2
        Optional
        - Video Files
        - Scalable Storage"]
    end

    subgraph External["External Services"]
        OpenAI["OpenAI API
        - Whisper API (or local whisper.cpp)
        - GPT API
        - Embeddings API (EMBEDDING_PROVIDER=openai)"]
        Ollama["Ollama Server
        Optional (Local)
        - Local LLM (LLM_PROVIDER=ollama)
        - Local Embeddings (EMBEDDING_PROVIDER=ollama)
        - No API key required"]
        WhisperLocal["Local whisper.cpp Server
        Optional
        - GPU-accelerated transcription
        - Metal support (Mac)
        - OpenAI-compatible endpoint"]
        Email["Email Service
        - SMTP
        - Email Sending"]
    end

    Browser -->|HTTP/HTTPS| Nginx
    Nginx -->|Proxy| FrontendSPA
    Nginx -->|Proxy| Django
    FrontendSPA -->|API Calls| Django
    Django --> PostgreSQL
    Django --> Redis
    Django --> LocalFS
    Django --> S3
    Django --> OpenAI
    Django -.->|Optional| Ollama
    Django --> Email
    Celery --> Redis
    Celery --> PostgreSQL
    Celery --> LocalFS
    Celery --> S3
    Celery --> OpenAI
    Celery -.->|Optional| Ollama
    Celery -.->|Optional| WhisperLocal
```

## Layer-by-Layer Detailed Configuration

```mermaid
graph TB
    subgraph Presentation["Presentation Layer"]
        P1[React Components]
        P2[React Router Routes]
        P3[UI Components]
        P4[Custom Hooks]
    end
    
    subgraph API["API Layer"]
        A1[REST API Endpoints]
        A2[Serializers]
        A3[View Classes]
        A4[Authentication]
    end
    
    subgraph Business["Business Logic Layer"]
        B1[Services]
        B2[Tasks]
        B3[Utils]
        B4[Managers]
    end
    
    subgraph DataAccess["Data Access Layer"]
        D1[Django ORM]
        D2[Models]
        D3[Query Optimizers]
        D4[Vector Manager]
    end
    
    subgraph Infrastructure["Infrastructure Layer"]
        I1[PostgreSQL]
        I2[Redis]
        I3[File Storage]
        I4[pgvector]
    end
    
    P1 --> P2
    P2 --> P3
    P3 --> P4
    P4 --> A1
    A1 --> A2
    A2 --> A3
    A3 --> A4
    A3 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4
    D4 --> I1
    D4 --> I4
    B2 --> I2
    B1 --> I3
```

## Network Configuration

```mermaid
graph TB
    %% Default (Docker Compose) topology
    subgraph Internet["Internet"]
        Users[Users]
    end

    subgraph AppNetwork["Docker Compose Network
    videoq-network"]
        Nginx["nginx
        :80"]
        Frontend["frontend
        Vite SPA (static)
        :80"]
        Backend["backend
        Django
        :8000"]
        Worker["celery-worker
        Celery"]
        DB[("postgres
        pg17 + pgvector
        :5432")]
        Cache[("redis
        :6379")]
    end

    Users -->|HTTP:80| Nginx
    Nginx -->|Proxy| Frontend
    Nginx -->|Proxy| Backend
    Frontend -->|API| Backend
    Backend -->|PostgreSQL| DB
    Backend -->|Redis| Cache
    Worker -->|Redis| Cache
    Worker -->|PostgreSQL| DB
```

> Note: The diagram above matches the default `docker-compose.yml` (single instance per service).
> If you need horizontal scaling (multiple frontend/backend/worker instances, DB replicas, etc.), treat it as a production architecture concern.

## Security Configuration

```mermaid
graph TB
    subgraph Security["Security Layer"]
        subgraph Authentication["Authentication"]
            JWT["JWT Authentication
            HttpOnly Cookie-based
            Access Token: 10 min
            Refresh Token: 14 days
            Automatic Refresh
            Secure Cookie Flag (env configurable)"]
            ShareToken["Share Token Authentication
            Temporary Access
            Guest Access"]
        end

        subgraph Authorization["Authorization"]
            Permissions["Permission Management
            Ownership Check
            Resource Access Control"]
        end

        subgraph Encryption["Encryption"]
            HTTPS["HTTPS Communication
            TLS/SSL
            Data Encryption"]
        end

        subgraph Protection["Protection"]
            CSRF["CSRF Protection
            SameSite Cookie"]
            CORS["CORS Settings
            Allowed Origin Restrictions"]
            RateLimit["Rate Limiting
            API Call Restrictions
            (DRF Throttling implemented)"]
        end
    end

    JWT --> Permissions
    ShareToken --> Permissions
    HTTPS --> Protection
    CSRF --> Protection
    CORS --> Protection
    RateLimit --> Protection
```

## Scalability Configuration

```mermaid
graph TB
    subgraph Horizontal["Horizontal Scaling"]
        H1["Frontend
        Multiple Instances"]
        H2["Backend
        Multiple Instances"]
        H3["Celery Worker
        Multiple Workers"]
    end

    subgraph Vertical["Vertical Scaling"]
        V1["Database
        Resource Enhancement"]
        V2["Cache
        Memory Enhancement"]
    end

    subgraph LoadBalancing["Load Balancing"]
        LB1["Nginx
        Request Distribution"]
        LB2["Redis
        Task Distribution"]
    end

    subgraph Caching["Caching"]
        C1["Redis Cache
        Session Management"]
        C2["Static Files
        CDN Support"]
    end

    H1 --> LB1
    H2 --> LB1
    H3 --> LB2
    LB1 --> V1
    LB2 --> V2
    C1 --> V2
    C2 --> H1
```

## Monitoring & Logging Configuration

```mermaid
graph TB
    subgraph Monitoring["Monitoring"]
        M1["Application Logs
        Django Logging"]
        M2["Access Logs
        Nginx Logs"]
        M3["Performance Monitoring
        Response Time"]
        M4["Error Tracking
        Exception Handling"]
    end

    subgraph Metrics["Metrics"]
        Met1[Request Count]
        Met2[Response Time]
        Met3[Error Rate]
        Met4[Task Processing Count]
    end

    subgraph Alerts["Alerts"]
        A1[Error Alerts]
        A2[Performance Alerts]
        A3[Resource Usage Alerts]
    end

    M1 --> Met1
    M2 --> Met2
    M3 --> Met3
    M4 --> Met4
    Met1 --> A1
    Met2 --> A2
    Met3 --> A3
    Met4 --> A3
```

## Deployment Configuration

```mermaid
graph TB
    subgraph Development["Development Environment"]
        Dev1["Local Development
        Docker Compose"]
        Dev2["Hot Reload
        Development Server"]
    end

    subgraph Staging["Staging Environment"]
        Stage1["Staging Server
        Test Environment"]
        Stage2["CI/CD Pipeline
        Auto Deployment"]
    end

    subgraph Production["Production Environment"]
        Prod1["Production Server
        Production Environment"]
        Prod2["Blue-Green Deployment
        Zero Downtime"]
    end

    subgraph CI_CD["CI/CD"]
        CI1[Git Push]
        CI2[Automated Tests]
        CI3[Build]
        CI4[Deploy]
    end

    Dev1 --> Stage1
    Dev2 --> Stage1
    Stage1 --> Stage2
    Stage2 --> Prod1
    CI1 --> CI2
    CI2 --> CI3
    CI3 --> CI4
    CI4 --> Prod2
```
