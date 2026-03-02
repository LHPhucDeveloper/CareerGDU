import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

// GET - Get all comments for a review
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const reviewId = searchParams.get("reviewId")

        if (!reviewId) {
            return NextResponse.json(
                { success: false, error: "Missing reviewId" },
                { status: 400 }
            )
        }

        const collection = await getCollection(COLLECTIONS.REVIEW_COMMENTS)

        const comments = await collection
            .find({ reviewId })
            .sort({ createdAt: 1 }) // Oldest first (new comments at bottom)
            .toArray()

        // Fetch user information for avatars
        const userIds = [...new Set(comments.filter(c => c.userId && c.userId.length === 24).map(c => c.userId))]

        let userMap: Record<string, string> = {}
        if (userIds.length > 0) {
            const usersCollection = await getCollection(COLLECTIONS.USERS)
            const users = await usersCollection
                .find({ _id: { $in: userIds.map(id => new ObjectId(id)) } })
                .project({ _id: 1, avatar: 1 })
                .toArray()

            users.forEach(u => {
                userMap[u._id.toString()] = u.avatar || ""
            })
        }

        return NextResponse.json({
            success: true,
            comments: comments.map(c => ({
                id: c._id.toString(),
                author: c.author,
                userId: c.userId,
                email: c.email, // Return email
                text: c.text,
                avatarUrl: (c.userId && userMap[c.userId]) ? userMap[c.userId] : (c.avatarUrl || ""), // Prefer dynamic avatar
                date: new Date(c.createdAt).toLocaleString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }),
                createdAt: c.createdAt
            }))
        })
    } catch (error) {
        console.error("[API] Error getting comments:", error)
        return NextResponse.json(
            { success: false, error: "Failed to get comments" },
            { status: 500 }
        )
    }
}

// POST - Add a new comment
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { reviewId, author, userId, email, text, avatar } = body

        if (!reviewId || !text?.trim()) {
            return NextResponse.json(
                { success: false, error: "Missing reviewId or text" },
                { status: 400 }
            )
        }

        const collection = await getCollection(COLLECTIONS.REVIEW_COMMENTS)

        const newComment = {
            reviewId,
            author: author || "Người dùng",
            userId: userId || "", // Save userId
            email: email || "",   // Save email
            avatarUrl: avatar || "", // Save avatar URL
            text: text.trim(),
            createdAt: new Date()
        }

        const result = await collection.insertOne(newComment)

        return NextResponse.json({
            success: true,
            comment: {
                id: result.insertedId.toString(),
                author: newComment.author,
                userId: newComment.userId,
                avatarUrl: newComment.avatarUrl,
                text: newComment.text,
                date: new Date().toLocaleString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric"
                }),
                createdAt: newComment.createdAt
            },
            message: "Bình luận đã được gửi"
        })
    } catch (error) {
        console.error("[API] Error adding comment:", error)
        return NextResponse.json(
            { success: false, error: "Failed to add comment" },
            { status: 500 }
        )
    }
}

// DELETE - Delete a comment
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const commentId = searchParams.get("id")

        if (!commentId) {
            return NextResponse.json(
                { success: false, error: "Missing comment id" },
                { status: 400 }
            )
        }

        const collection = await getCollection(COLLECTIONS.REVIEW_COMMENTS)

        const result = await collection.deleteOne({ _id: new ObjectId(commentId) })

        if (result.deletedCount === 0) {
            return NextResponse.json(
                { success: false, error: "Comment not found" },
                { status: 404 }
            )
        }

        return NextResponse.json({
            success: true,
            message: "Bình luận đã được xóa"
        })
    } catch (error) {
        console.error("[API] Error deleting comment:", error)
        return NextResponse.json(
            { success: false, error: "Failed to delete comment" },
            { status: 500 }
        )
    }
}
