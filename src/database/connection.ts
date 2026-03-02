/**
 * MongoDB Connection Utility
 *
 * For local development with VSCode:
 * 1. Install MongoDB Community Server: https://www.mongodb.com/try/download/community
 * 2. Start MongoDB service: mongod --dbpath /path/to/data
 * 3. Set environment variable: MONGODB_URI=mongodb://localhost:27017/gdu_career
 *
 * Or use MongoDB Atlas (cloud):
 * 1. Create free cluster at https://cloud.mongodb.com
 * 2. Get connection string and set MONGODB_URI environment variable
 */

import { MongoClient, type Db } from "mongodb"

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/gdu_career"

let client: MongoClient | null = null
let db: Db | null = null

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (client && db) {
    return { client, db }
  }

  try {
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    db = client.db("gdu_career")

    console.log("Connected to MongoDB successfully")
    return { client, db }
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error)
    throw error
  }
}

export async function getCollection(collectionName: string) {
  const { db } = await connectToDatabase()
  return db.collection(collectionName)
}

// Collection names
export const COLLECTIONS = {
  USERS: "users",
  JOBS: "jobs",
  APPLICATIONS: "applications",
  REVIEWS: "google_reviews",
  DAILY_UPDATES: "daily_updates",
  COMPANIES: "companies",
  REVIEW_LIKES: "review_likes",
  REVIEW_COMMENTS: "review_comments",
  USER_REVIEWS: "user_reviews",
  SAVED_JOBS: "saved_jobs",
  CONTACTS: "contacts",
  NOTIFICATIONS: "notifications",
  VISITORS: "visitors",
  REPORTS: "reports",
  PENDING_USERS: "pending_users",
  NEWS: "news",
  HERO_SLIDES: "hero_slides",
  SITE_CONFIGS: "site_configs",
} as const
