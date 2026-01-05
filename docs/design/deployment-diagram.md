# Deployment Diagram

## Overview

This diagram shows VideoQ's default deployment (Docker Compose).

## Docker Compose Configuration

```mermaid
graph TB
    subgraph DockerHost["Docker Host"]
        subgraph Network["videoq-network"]
            subgraph FrontendContainer["frontend (Vite SPA)"]
                FrontendSPA[Static React SPA<br/>Port: 80]
            end
            
            subgraph BackendContainer["backend (Django)"]
                Django[Django REST API<br/>Port: 8000]
                Gunicorn[Gunicorn WSGI Server]
            end
            
            subgraph CeleryContainer["celery-worker"]
                CeleryWorker[Celery Worker]
            end
            
            subgraph NginxContainer["nginx"]
                Nginx[Nginx Reverse Proxy<br/>Port: 80]
            end
            
            subgraph PostgresContainer["postgres"]
                PostgreSQL[(PostgreSQL 17<br/>+ pgvector)]
            end
            
            subgraph RedisContainer["redis"]
                Redis[(Redis<br/>Alpine)]
            end
        end
        
        subgraph Volumes["Docker Volumes"]
            PostgresData[postgres_data<br/>Persistence]
            StaticFiles[staticfiles<br/>Static Files]
            MediaFiles[./backend/media<br/>Media Files]
        end
    end
    
    subgraph External["External Network"]
        User[User]
        OpenAI[OpenAI API]
        EmailService[Email Service]
    end
    
    User -->|HTTP/HTTPS| Nginx
    Nginx -->|Proxy| FrontendSPA
    Nginx -->|Proxy| Django
    Django --> PostgreSQL
    Django --> Redis
    Django --> MediaFiles
    CeleryWorker --> Redis
    CeleryWorker --> PostgreSQL
    CeleryWorker --> MediaFiles
    CeleryWorker -->|API Call| OpenAI
    Django -->|API Call| OpenAI
    Django -->|SMTP| EmailService
    
    PostgreSQL -.->|Persist| PostgresData
    Django -.->|Static Files| StaticFiles
    Django -.->|Media Files| MediaFiles
```

## Service Details Configuration

```mermaid
graph LR
    subgraph Services["Docker Compose Services"]
        S1["redis
        redis:alpine"]
        S2["postgres
        pgvector/pgvector:pg17"]
        S3["backend
        Django + Gunicorn"]
        S4["celery-worker
        Celery Worker"]
        S5["frontend
        Vite SPA static"]
        S6["nginx
        nginx:alpine"]
    end

    subgraph Dependencies["Dependencies"]
        S3 --> S2
        S3 --> S1
        S4 --> S1
        S5 --> S3
        S6 --> S3
        S6 --> S5
    end

    subgraph Ports["Port Mapping"]
        P1["80:80
        nginx"]
    end

    S6 --> P1
```

## Network Configuration

```mermaid
graph TB
    subgraph Network["videoq-network (bridge)"]
        N1[nginx]
        N2[frontend]
        N3[backend]
        N4[celery-worker]
        N5[postgres]
        N6[redis]
    end
    
    N1 -.->|HTTP| N2
    N1 -.->|HTTP| N3
    N3 -.->|PostgreSQL| N5
    N3 -.->|Redis| N6
    N4 -.->|Redis| N6
    N4 -.->|PostgreSQL| N5
    N3 -.->|File Access| Media
    N4 -.->|File Access| Media
    
    subgraph ExternalNetwork["External Network"]
        Internet[Internet]
    end
    
    Internet -->|Port 80| N1
```

## Volume Configuration

```mermaid
graph TB
    subgraph NamedVolumes["Named Volumes"]
        V1[postgres_data<br/>/var/lib/postgresql/data]
        V2[staticfiles<br/>/app/staticfiles]
    end
    
    subgraph BindMounts["Bind Mounts"]
        V3[./backend/media<br/>/app/media]
        V4[./backend/app/migrations<br/>/app/app/migrations]
        V5[./nginx.conf<br/>/etc/nginx/nginx.conf]
    end
    
    subgraph Containers["Containers"]
        C1[postgres]
        C2[backend]
        C3[celery-worker]
        C4[nginx]
    end
    
    C1 --> V1
    C2 --> V2
    C2 --> V3
    C2 --> V4
    C3 --> V3
    C4 --> V2
    C4 --> V3
    C4 --> V5
```

## Deployment Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Docker as Docker Compose
    participant Containers as Container Group
    participant Services as Services

    Dev->>Docker: docker compose up -d
    Docker->>Containers: Start Containers
    
    par Parallel Startup
        Containers->>Services: Start postgres
        Containers->>Services: Start redis
    end
    
    Services->>Services: postgres Ready
    Services->>Services: redis Ready
    
    par Dependent Services Startup
        Containers->>Services: Start backend
        Containers->>Services: Start celery-worker
    end
    
    Services->>Services: backend Ready
    Services->>Services: celery-worker Ready
    
    Containers->>Services: Start frontend
    Services->>Services: frontend Ready
    
    Containers->>Services: Start nginx
    Services->>Services: nginx Ready
    
    Services-->>Dev: All Services Started
```

## Environment Variables Configuration

```mermaid
graph TB
    subgraph EnvFile[".env File"]
        E1[POSTGRES_DB]
        E2[POSTGRES_USER]
        E3[POSTGRES_PASSWORD]
        E4["SECRET_KEY<br/>(recommended; required for production)"]
        E5[DATABASE_URL]
        E6[CELERY_BROKER_URL]
        E6b[CELERY_RESULT_BACKEND]
        E7[ENABLE_SIGNUP]
        E8[ALLOWED_HOSTS]
        E9[CORS_ALLOWED_ORIGINS]
        E10[SECURE_COOKIES]
        E11[FRONTEND_URL]
        E12[USE_S3_STORAGE]
        E13[AWS_*]
        E14["OPENAI_API_KEY<br/>(optional / not used in standard flow)"]
        E15[VITE_API_URL]
    end
    
    subgraph Containers["Containers"]
        C1[postgres]
        C2[backend]
        C3[celery-worker]
        C4[frontend]
    end
    
    E1 --> C1
    E2 --> C1
    E3 --> C1
    E4 --> C2
    E5 --> C2
    E6 --> C2
    E6b --> C2
    E6 --> C3
    E6b --> C3
    E7 --> C2
    E8 --> C2
    E9 --> C2
    E10 --> C2
    E11 --> C2
    E12 --> C2
    E13 --> C2
    E14 --> C2
    E14 --> C3
    E15 --> C4
```

## Optional: Scaling Configuration (production example)

> Note: The default `docker-compose.yml` runs a single instance per service.
> The diagram below is an example of how you might scale in production.

```mermaid
graph TB
    subgraph LoadBalancer["Load Balancer"]
        LB[Nginx]
    end
    
    subgraph FrontendInstances["Frontend Instances"]
        F1[frontend-1]
        F2[frontend-2]
        F3[frontend-N]
    end
    
    subgraph BackendInstances["Backend Instances"]
        B1[backend-1]
        B2[backend-2]
        B3[backend-N]
    end
    
    subgraph CeleryInstances["Celery Worker Instances"]
        C1[celery-worker-1]
        C2[celery-worker-2]
        C3[celery-worker-N]
    end
    
    subgraph SharedServices["Shared Services"]
        DB[(PostgreSQL)]
        Cache[(Redis)]
    end
    
    LB --> F1
    LB --> F2
    LB --> F3
    F1 --> B1
    F2 --> B2
    F3 --> B3
    B1 --> DB
    B2 --> DB
    B3 --> DB
    B1 --> Cache
    B2 --> Cache
    B3 --> Cache
    C1 --> Cache
    C2 --> Cache
    C3 --> Cache
    C1 --> DB
    C2 --> DB
    C3 --> DB
```
