# GrabPic - Features & Functionality

**Version:** 1.0
**Date:** February 9, 2026
**Owner:** Product Engineering
**Status:** Planning Phase

---

## MVP (Phase 1) - Weeks 1-4

### Organizer Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Bulk Photo Upload** | Drag-and-drop or file picker, max 1000 photos/event | P0 |
| **Event Creation** | Simple form: event name, date, passcode | P0 |
| **Processing Dashboard** | Real-time progress bar for face detection | P0 |
| **Share Event Code** | Unique 6-digit code + QR code | P0 |
| **Event Expiry** | Auto-delete after 30 days (privacy) | P0 |

### Attendee Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Event Access** | Enter code → access event | P0 |
| **Selfie Capture** | Front camera with live preview | P0 |
| **Face Matching** | Display matched photos in grid | P0 |
| **Photo Download** | Individual or bulk download | P0 |
| **Gallery View** | Lightbox with zoom, swipe navigation | P1 |

### System Features
| Feature | Description | Priority |
|---------|-------------|----------|
| **Face Detection** | Detect all faces in uploaded photos | P0 |
| **Embedding Generation** | Create 512-dim vectors per face | P0 |
| **Face Clustering** | Group similar faces (same person) | P0 |
| **Vector Search** | Cosine similarity for matching | P0 |
| **Image Optimization** | Thumbnail generation (200px, 800px) | P1 |

## Phase 2 (Weeks 5-8) - Enhanced Features

| Feature | Description | Impact |
|---------|-------------|--------|
| **Quality Scoring** | Rank photos by smile, sharpness, composition | High |
| **Multi-Face Search** | "Find photos with me AND friends" | High |
| **Privacy Blur** | Blur other faces in downloaded photos | Medium |
| **Email Delivery** | Email personalized gallery link | Medium |
| **Analytics Dashboard** | Organizer sees download stats | Low |
| **Group Detection** | Identify common groups in photos | Low |

## Phase 3 (Weeks 9-12) - Monetization & Scale

| Feature | Description | Impact |
|---------|-------------|--------|
| **Paid Tiers** | Free: 100 photos, Paid: Unlimited | Critical |
| **Watermark Removal** | Paid feature | High |
| **API for Photographers** | B2B integration | High |
| **Album Auto-Generation** | AI-curated best-of albums | Medium |
| **Video Support** | Face detection in videos | Low |