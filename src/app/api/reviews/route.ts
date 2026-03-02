import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
// Import data directly so it's bundled by Next.js
import reviewsData from "@/data/reviews.json"

function getAvatarColor(name: string): string {
  const colors = [
    "from-blue-500 to-blue-600",
    "from-purple-500 to-purple-600",
    "from-pink-500 to-pink-600",
    "from-green-500 to-green-600",
    "from-yellow-500 to-yellow-600",
    "from-red-500 to-red-600",
    "from-indigo-500 to-indigo-600",
    "from-teal-500 to-teal-600",
    "from-orange-500 to-orange-600",
    "from-cyan-500 to-cyan-600",
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}

interface ProcessedReview {
  id: number
  name: string
  avatar: string
  avatarUrl: string
  rating: number
  comment: string
  raw_rating: string
  review_time: string
  verified: boolean
}

function getReviewsData() {
  const reviews = reviewsData as ProcessedReview[]

  if (!reviews || reviews.length === 0) {
    return []
  }

  return reviews.map((review) => {
    return {
      id: String(review.id),
      author: review.name,
      avatar: review.avatar,
      avatarUrl: review.avatarUrl || "",
      avatarColor: getAvatarColor(review.name),
      major: "Sinh viên GDU",
      year: "K2023",
      rating: review.rating,
      category: "Đánh giá Google Maps",
      title: generateTitle(review.comment, review.rating),
      content: review.comment,
      likes: 0,
      comments: 0,
      date: "",
      review_time: review.review_time || "",
      helpful: review.verified,
    }
  })
}

function generateTitle(comment: string, rating: number): string {
  if (!comment || comment.trim().length === 0) {
    return rating >= 4 ? "Trải nghiệm tốt" : rating === 3 ? "Trải nghiệm khá" : "Cần cải thiện"
  }

  if (comment.length <= 50) return comment

  const firstSentence = comment.split(/[.!?]/)[0].trim()
  if (firstSentence.length > 0 && firstSentence.length <= 60) {
    return firstSentence
  }

  return comment.substring(0, 50) + "..."
}

function mapDepartmentToCategory(department: string): string {
  const mapping: Record<string, string> = {
    "Công nghệ thông tin": "Chương trình đào tạo",
    "Kinh tế": "Chương trình đào tạo",
    "Quản trị kinh doanh": "Hỗ trợ việc làm",
    Marketing: "Hoạt động sinh viên",
    General: "Khác",
  }
  return mapping[department] || "Chương trình đào tạo"
}

import { getCollection, COLLECTIONS } from "@/database/connection"

// Helper to map MongoDB review to frontend format
function mapUserReview(doc: any): any {
  return {
    id: doc._id.toString(),
    author: doc.author,
    avatar: doc.avatar || "ND",
    avatarColor: doc.avatarColor || "from-primary to-secondary",
    major: doc.major || "Sinh viên GDU",
    year: doc.year || "2024",
    rating: doc.rating,
    category: doc.category,
    title: doc.title,
    content: doc.content,
    likes: 0, // Will be populated by stats aggregation
    comments: 0, // Will be populated by stats aggregation
    date: doc.date || new Date().toLocaleDateString("vi-VN"),
    helpful: false,
    userId: doc.userId,
    isUserReview: true
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const userId = searchParams.get("userId")
    const visitorId = searchParams.get("visitorId")

    // Get base URL from request for fetching static files
    const url = new URL(request.url)
    const baseUrl = `${url.protocol}//${url.host}`

    // 1. Load JSON Reviews (Sync)
    const jsonReviews = getReviewsData()

    // 2. Load User Reviews from MongoDB
    let userReviews: any[] = []
    try {
      const collection = await getCollection(COLLECTIONS.USER_REVIEWS)
      const docs = await collection.find().sort({ createdAt: -1 }).toArray()

      // Dynamic Avatar Lookup
      const userIds = [...new Set(docs.map(d => d.userId).filter(id => id && typeof id === 'string' && id.length === 24))]
      let userMap: Record<string, string> = {}

      if (userIds.length > 0) {
        try {
          const uCol = await getCollection(COLLECTIONS.USERS)
          const users = await uCol.find({ _id: { $in: userIds.map(id => new ObjectId(id)) } }).project({ _id: 1, avatar: 1 }).toArray()
          users.forEach(u => userMap[u._id.toString()] = u.avatar || "")
        } catch (err) {
          console.error("Error fetching user avatars:", err)
        }
      }

      userReviews = docs.map(doc => {
        const mapped = mapUserReview(doc)
        if (doc.userId && userMap[doc.userId]) {
          mapped.avatarUrl = userMap[doc.userId]
        }
        return mapped
      })
    } catch (e) {
      console.error("[v0] Failed to load user reviews:", e)
    }

    // 3. Combine Reviews (User reviews first)
    const reviews = [...userReviews, ...jsonReviews]

    if (reviews.length === 0) {
      return NextResponse.json({
        success: true,
        reviews: [],
        total: 0,
        source: "none",
        message: "Chưa có dữ liệu.",
      })
    }

    // 4. Get real-time stats from MongoDB
    let likedReviewIds: string[] = []

    try {
      const likesCollection = await getCollection(COLLECTIONS.REVIEW_LIKES)
      const commentsCollection = await getCollection(COLLECTIONS.REVIEW_COMMENTS)

      // Aggregate likes count by reviewId
      const likesCounts = await likesCollection.aggregate([
        { $group: { _id: "$reviewId", count: { $sum: 1 } } }
      ]).toArray()

      // Aggregate comments count by reviewId
      const commentsCounts = await commentsCollection.aggregate([
        { $group: { _id: "$reviewId", count: { $sum: 1 } } }
      ]).toArray()

      // Create maps for O(1) lookup
      const likesMap = likesCounts.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count
        return acc
      }, {})

      const commentsMap = commentsCounts.reduce((acc: any, curr: any) => {
        acc[curr._id] = curr.count
        return acc
      }, {})

      // Get liked reviews for current user/visitor
      if (userId || visitorId) {
        const query: any = {}
        if (userId) {
          query.visitorId = userId // Logic cũ lưu userId vào field visitorId nếu là user
        } else if (visitorId) {
          query.visitorId = visitorId
        }

        // Note: The ReviewLike schema stores user/visitor ID in 'visitorId' field
        // We should check both exact match or if we migrate to userId field later
        const userLikes = await likesCollection.find(query).toArray()
        likedReviewIds = userLikes.map(like => like.reviewId)
      }

      // Merge stats into reviews
      const enrichedReviews = reviews.map((review) => ({
        ...review,
        likes: likesMap[review.id] || 0,
        comments: commentsMap[review.id] || 0,
      }))

      let filteredReviews = enrichedReviews

      if (category && category !== "Tất cả") {
        filteredReviews = enrichedReviews.filter((r) => r.category === category)
      }

      return NextResponse.json({
        success: true,
        reviews: filteredReviews,
        total: filteredReviews.length,
        source: "mixed",
        likedReviewIds, // Return list of liked review IDs
      })

    } catch (dbError) {
      console.error("[v0] MongoDB stats fetch error:", dbError)
      // Fallback
      let filteredReviews = reviews
      if (category && category !== "Tất cả") {
        filteredReviews = reviews.filter((r) => r.category === category)
      }
      return NextResponse.json({
        success: true,
        reviews: filteredReviews,
        total: filteredReviews.length,
        source: "mixed",
        likedReviewIds: [],
      })
    }
  } catch (error) {
    console.error("[v0] Error fetching reviews:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch reviews",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Determine avatar and avatarUrl
    let avatarInitials = "ND"
    let avatarUrl = ""

    if (body.avatar && (body.avatar.startsWith("/") || body.avatar.startsWith("http"))) {
      avatarUrl = body.avatar
      avatarInitials = (body.author || "U").charAt(0).toUpperCase()
    } else {
      avatarInitials = body.avatar || (body.author || "U").charAt(0).toUpperCase()
    }

    // Create user review object
    const newReview = {
      author: body.author || "Người dùng ẩn danh",
      userId: body.userId || null,
      email: body.email || null,
      avatar: avatarInitials,
      avatarUrl: avatarUrl,
      avatarColor: "from-primary to-secondary",
      major: "Sinh viên GDU", // Default for now
      year: new Date().getFullYear().toString(),
      rating: body.rating || 5,
      category: body.category || "Khác",
      title: body.title || "Đánh giá mới",
      content: body.content || "",
      likes: 0,
      comments: 0,
      date: new Date().toLocaleDateString("vi-VN"),
      createdAt: new Date(),
      helpful: false,
    }

    // Save to MongoDB
    const collection = await getCollection(COLLECTIONS.USER_REVIEWS)
    const result = await collection.insertOne(newReview)

    // Create Notification for Admins
    try {
      const notificationsCollection = await getCollection(COLLECTIONS.NOTIFICATIONS)
      await notificationsCollection.insertOne({
        targetRole: 'admin',
        type: 'system', // or 'visitor' or 'review' if added to types
        title: 'Đánh giá mới',
        message: `${newReview.author} vừa gửi một đánh giá: "${newReview.title}"`,
        read: false,
        createdAt: new Date(),
        link: '/dashboard/reviews'
      })
    } catch (notifError) {
      console.error("Failed to create notification:", notifError)
    }

    const responseReview = {
      ...newReview,
      id: result.insertedId.toString(),
      likes: 0,
      comments: 0
    }

    return NextResponse.json({
      success: true,
      message: "Đánh giá đã được gửi thành công!",
      review: responseReview,
    })
  } catch (error) {
    console.error("[v0] Error submitting review:", error)
    return NextResponse.json(
      { success: false, error: "Failed to submit review" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    const userId = searchParams.get("userId")

    if (!id || !userId) {
      return NextResponse.json({ success: false, error: "Missing id or userId" }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.USER_REVIEWS)
    const review = await collection.findOne({ _id: new ObjectId(id) })

    if (!review) {
      return NextResponse.json({ success: false, error: "Review not found" }, { status: 404 })
    }

    // Ownership check (userId or email fallback could be added if needed, but userId is primary)
    if (review.userId !== userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 })
    }

    await collection.deleteOne({ _id: new ObjectId(id) })

    return NextResponse.json({ success: true, message: "Đánh giá đã được xóa" })
  } catch (error) {
    console.error("Delete review error:", error)
    return NextResponse.json({ success: false, error: "Failed to delete review" }, { status: 500 })
  }
}
