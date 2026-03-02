import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

export interface Notification {
  _id?: ObjectId
  userId?: string // Made optional because admin notifications might not have a specific userId
  targetRole?: "admin" | "user" // Add targetRole
  type: "job" | "message" | "interview" | "system" | "visitor"
  title: string
  message: string
  read: boolean
  createdAt: Date
  link?: string
}

// GET - Lấy notifications của user
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const role = searchParams.get("role")?.toLowerCase() // Get user role from params and normalize

    console.log("[Notifications API] GET - userId:", userId, "role:", role)

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.NOTIFICATIONS)

    // Build query based on role
    let query: any = { userId }

    // For students and other roles, default query { userId } is used

    // Fetch user created date to filter out old broadcast notifications
    const usersCollection = await getCollection(COLLECTIONS.USERS)
    let userCreatedAt = new Date(0); // Default to epoch if user not found (shouldn't happen)
    try {
      if (userId) {
        const { ObjectId } = await import("mongodb")
        // Ensure userId is valid ObjectId before querying
        if (ObjectId.isValid(userId)) {
          const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) })
          if (currentUser?.createdAt) {
            userCreatedAt = new Date(currentUser.createdAt)
            console.log("[Notifications API] User created at:", userCreatedAt)
          }
        }
      }
    } catch (e) {
      console.error("[Notifications API] Error fetching user created date:", e)
    }

    if (role === 'admin') {
      // Admin sees: their own notifications + all admin-targeted notifications
      // For admins, maybe we want to show ALL history? Or valid history?
      // Let's assume admins should see everything for context, OR just their timeline.
      // For now, let's filter by timeline too to reduce noise.
      query = {
        $or: [
          { userId },
          {
            targetRole: 'admin',
            createdAt: { $gte: userCreatedAt }
          }
        ]
      }
      console.log("[Notifications API] ADMIN Query Filter - role match found")
    } else if (role === 'employer') {
      // Employer sees: their own notifications OR notifications targeted at 'employer' role
      query = {
        $or: [
          { userId },
          {
            targetRole: 'employer',
            createdAt: { $gte: userCreatedAt }
          }
        ]
      }
    }

    console.log("[Notifications API] Query:", JSON.stringify(query))

    const notifications = await collection
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray()

    console.log("[Notifications API] Found", notifications.length, "notifications")

    // Count unread notifications
    // For admin, we might need a separate way to track "read" status for shared notifications,
    // but for now, let's keep it simple: if it's in the list and read=false, it's unread.
    // (Note: In a shared notification system, "read" status is tricky. 
    // Usually, you'd verify if *this* user has read it. 
    // For this simple implementation, we'll assume shared notifications are "read" if the flag is true in DB, 
    // which means if ANY admin reads it, it's read for all. OR we rely on client side state. 
    // Let's stick to the simple DB flag for now as requested.)
    const unreadCount = notifications.filter((n) => !n.read).length

    return NextResponse.json({
      success: true,
      data: notifications,
      unreadCount,
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    return NextResponse.json({ success: false, error: "Failed to fetch notifications" }, { status: 500 })
  }
}

// POST - Tạo notification mới
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, targetRole, type, title, message, link } = body

    // Validate: Needs either userId OR targetRole
    if ((!userId && !targetRole) || !type || !title || !message) {
      return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 })
    }

    const collection = await getCollection(COLLECTIONS.NOTIFICATIONS)
    const notification: Omit<Notification, "_id"> = {
      userId,
      targetRole,
      type,
      title,
      message,
      read: false,
      createdAt: new Date(),
      link,
    }

    const result = await collection.insertOne(notification)

    return NextResponse.json({
      success: true,
      data: { ...notification, _id: result.insertedId },
    })
  } catch (error) {
    console.error("Error creating notification:", error)
    return NextResponse.json({ success: false, error: "Failed to create notification" }, { status: 500 })
  }
}

// PATCH - Đánh dấu đã đọc
export async function PATCH(request: Request) {
  try {
    const { notificationId, action, userId } = await request.json()

    const collection = await getCollection(COLLECTIONS.NOTIFICATIONS)

    if (action === "mark_read" && notificationId) {
      await collection.updateOne(
        { _id: new ObjectId(notificationId) },
        { $set: { read: true } }
      )
      return NextResponse.json({
        success: true,
        message: "Notification marked as read",
      })
    }

    if (action === "mark_all_read" && userId) {
      const { role } = await request.json().catch(() => ({ role: null }))

      let query: any = { userId, read: false }

      if (role === 'admin' || role === 'employer') {
        query = {
          $or: [
            { userId, read: false },
            { targetRole: role, read: false }
          ]
        }
      }

      await collection.updateMany(
        query,
        { $set: { read: true } }
      )
      return NextResponse.json({
        success: true,
        message: "All notifications marked as read",
      })
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Error updating notification:", error)
    return NextResponse.json({ success: false, error: "Failed to update notification" }, { status: 500 })
  }
}

// DELETE - Xóa notification
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const notificationId = searchParams.get("id")
    const action = searchParams.get("action")
    const userId = searchParams.get("userId")
    const role = searchParams.get("role")?.toLowerCase()

    const collection = await getCollection(COLLECTIONS.NOTIFICATIONS)

    if (action === "delete_all") {
      if (!userId) {
        return NextResponse.json({ success: false, error: "userId is required for delete_all" }, { status: 400 })
      }

      // Reconstruct query matching GET logic to ensuring we delete what the user sees
      // Fetch user created date for filter
      const usersCollection = await getCollection(COLLECTIONS.USERS)
      let userCreatedAt = new Date(0);
      try {
        const { ObjectId } = await import("mongodb")
        if (ObjectId.isValid(userId)) {
          const currentUser = await usersCollection.findOne({ _id: new ObjectId(userId) })
          if (currentUser?.createdAt) {
            userCreatedAt = new Date(currentUser.createdAt)
          }
        }
      } catch (e) { }

      let query: any = { userId }
      if (role === 'admin') {
        query = {
          $or: [
            { userId },
            {
              targetRole: 'admin',
              createdAt: { $gte: userCreatedAt }
            }
          ]
        }
      } else if (role === 'employer') {
        query = {
          $or: [
            { userId },
            {
              targetRole: 'employer',
              createdAt: { $gte: userCreatedAt }
            }
          ]
        }
      }

      const result = await collection.deleteMany(query)

      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deletedCount} notifications`,
      })
    }

    if (!notificationId) {
      return NextResponse.json({ success: false, error: "Notification ID is required" }, { status: 400 })
    }

    await collection.deleteOne({ _id: new ObjectId(notificationId) })

    return NextResponse.json({
      success: true,
      message: "Notification deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting notification:", error)
    return NextResponse.json({ success: false, error: "Failed to delete notification" }, { status: 500 })
  }
}
