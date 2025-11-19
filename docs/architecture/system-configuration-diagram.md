# System Configuration Diagram

## Overview

This diagram represents the overall architecture and system configuration of the Ask Video system.

## Overall System Configuration

```mermaid
graph TB
    subgraph Client["Client Layer"]
        Browser[Web Browser<br/>Chrome, Firefox, Safari, etc.]
    end
    
    subgraph Gateway["Gateway Layer"]
        Nginx[Nginx Reverse Proxy<br/>Port: 80<br/>- Reverse Proxy<br/>- Static File Delivery<br/>- Load Balancing]
    end
    
    subgraph Application["Application Layer"]
        subgraph Frontend["Frontend"]
            NextJS[Next.js Application<br/>Port: 3000<br/>- React<br/>- TypeScript<br/>- App Router]
        end
        
        subgraph Backend["Backend"]
            Django[Django REST API<br/>Port: 8000<br/>- Django 5.2.7+<br/>- DRF<br/>- Gunicorn]
        end
        
        subgraph Worker["Worker"]
            Celery[Celery Worker<br/>- Asynchronous Task Processing<br/>- Transcription Processing]
        end
    end
    
    subgraph Data["Data Layer"]
        PostgreSQL[(PostgreSQL 17<br/>+ pgvector<br/>- Structured Data<br/>- Vector Data)]
        Redis[(Redis Alpine<br/>- Task Queue<br/>- Cache)]
    end
    
    subgraph Storage["Storage Layer"]
        LocalFS[Local File System<br/>/backend/media<br/>- Video Files<br/>- Static Files]
        S3[AWS S3<br/>Optional<br/>- Video Files<br/>- Scalable Storage]
    end
    
    subgraph External["External Services"]
        OpenAI[OpenAI API<br/>- Whisper API<br/>- GPT API<br/>- Embeddings API]
        Email[Email Service<br/>- SMTP<br/>- Email Sending]
    end
    
    Browser -->|HTTP/HTTPS| Nginx
    Nginx -->|Proxy| NextJS
    Nginx -->|Proxy| Django
    NextJS -->|API Calls| Django
    Django --> PostgreSQL
    Django --> Redis
    Django --> LocalFS
    Django --> S3
    Django --> OpenAI
    Django --> Email
    Celery --> Redis
    Celery --> PostgreSQL
    Celery --> LocalFS
    Celery --> S3
    Celery --> OpenAI
```

## Layer-by-Layer Detailed Configuration

```mermaid
graph TB
    subgraph Presentation["Presentation Layer"]
        P1[React Components]
        P2[Next.js Pages]
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
    subgraph Internet["Internet"]
        Users[Users]
    end
    
    subgraph DMZ["DMZ"]
        LB[Load Balancer<br/>Nginx]
    end
    
    subgraph AppNetwork["Application Network<br/>ask-video-network"]
        subgraph WebTier["Web Tier"]
            Web1[Frontend-1]
            Web2[Frontend-2]
        end
        
        subgraph AppTier["Application Tier"]
            App1[Backend-1]
            App2[Backend-2]
        end
        
        subgraph WorkerTier["Worker Tier"]
            Worker1[Celery-Worker-1]
            Worker2[Celery-Worker-2]
        end
    end
    
    subgraph DataNetwork["Data Network"]
        subgraph DatabaseTier["Database Tier"]
            DB1[(PostgreSQL<br/>Primary)]
            DB2[(PostgreSQL<br/>Replica)]
        end
        
        subgraph CacheTier["Cache Tier"]
            Cache1[(Redis<br/>Master)]
            Cache2[(Redis<br/>Replica)]
        end
    end
    
    Users -->|HTTPS:443| LB
    LB -->|HTTP:3000| Web1
    LB -->|HTTP:3000| Web2
    Web1 -->|HTTP:8000| App1
    Web2 -->|HTTP:8000| App2
    App1 -->|PostgreSQL:5432| DB1
    App2 -->|PostgreSQL:5432| DB1
    App1 -->|Redis:6379| Cache1
    App2 -->|Redis:6379| Cache1
    Worker1 -->|Redis:6379| Cache1
    Worker2 -->|Redis:6379| Cache1
    Worker1 -->|PostgreSQL:5432| DB1
    Worker2 -->|PostgreSQL:5432| DB1
    DB1 -.->|Replication| DB2
    Cache1 -.->|Replication| Cache2
```

## Security Configuration

```mermaid
graph TB
    subgraph Security["Security Layer"]
        subgraph Authentication["Authentication"]
            JWT[JWT Authentication<br/>- Access Token<br/>- Refresh Token<br/>- HttpOnly Cookie]
            ShareToken[Share Token Authentication<br/>- Temporary Access<br/>- Guest Access]
        end
        
        subgraph Authorization["Authorization"]
            Permissions[Permission Management<br/>- Ownership Check<br/>- Resource Access Control]
        end
        
        subgraph Encryption["Encryption"]
            HTTPS[HTTPS Communication<br/>- TLS/SSL<br/>- Data Encryption]
        end
        
        subgraph Protection["Protection"]
            CSRF[CSRF Protection<br/>- SameSite Cookie]
            CORS[CORS Settings<br/>- Allowed Origin Restrictions]
            RateLimit[Rate Limiting<br/>- API Call Restrictions]
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
        H1[Frontend<br/>Multiple Instances]
        H2[Backend<br/>Multiple Instances]
        H3[Celery Worker<br/>Multiple Workers]
    end
    
    subgraph Vertical["Vertical Scaling"]
        V1[Database<br/>Resource Enhancement]
        V2[Cache<br/>Memory Enhancement]
    end
    
    subgraph LoadBalancing["Load Balancing"]
        LB1[Nginx<br/>Request Distribution]
        LB2[Redis<br/>Task Distribution]
    end
    
    subgraph Caching["Caching"]
        C1[Redis Cache<br/>Session Management]
        C2[Static Files<br/>CDN Support]
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
        M1[Application Logs<br/>Django Logging]
        M2[Access Logs<br/>Nginx Logs]
        M3[Performance Monitoring<br/>Response Time]
        M4[Error Tracking<br/>Exception Handling]
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
        Dev1[Local Development<br/>Docker Compose]
        Dev2[Hot Reload<br/>Development Server]
    end
    
    subgraph Staging["Staging Environment"]
        Stage1[Staging Server<br/>Test Environment]
        Stage2[CI/CD Pipeline<br/>Auto Deployment]
    end
    
    subgraph Production["Production Environment"]
        Prod1[Production Server<br/>Production Environment]
        Prod2[Blue-Green Deployment<br/>Zero Downtime]
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
