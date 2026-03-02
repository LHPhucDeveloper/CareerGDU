import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { ObjectId } from "mongodb"

// POST - Toggle like for a review
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { reviewId, visitorId } = body

        if (!reviewId || !visitorId) {
            return NextResponse.json(
                { success: false, error: "Missing reviewId or visitorId" },
                { status: 400 }
            )
        }

        const collection = await getCollection(COLLECTIONS.REVIEW_LIKES)

        // Check if user already liked this review
        const existingLike = await collection.findOne({ reviewId, visitorId })

        if (existingLike) {
            // Unlike - remove the like
            await collection.deleteOne({ _id: existingLike._id })
            const totalLikes = await collection.countDocuments({ reviewId })
            return NextResponse.json({
                success: true,
                liked: false,
                totalLikes,
                message: "Đã bỏ thích"
            })
        } else {
            // Like - add new like
            await collection.insertOne({
                reviewId,
                visitorId,
                createdAt: new Date()
            })
            const totalLikes = await collection.countDocuments({ reviewId })
            return NextResponse.json({
                success: true,
                liked: true,
                totalLikes,
                message: "Đã thích"
            })
        }
    } catch (error) {
        console.error("[API] Error toggling like:", error)
        return NextResponse.json(
            { success: false, error: "Failed to toggle like" },
            { status: 500 }
        )
    }
}

// GET - Get likes for a review and check if user liked
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const reviewId = searchParams.get("reviewId")
        const visitorId = searchParams.get("visitorId")

        if (!reviewId) {
            return NextResponse.json(
                { success: false, error: "Missing reviewId" },
                { status: 400 }
            )
        }

        const collection = await getCollection(COLLECTIONS.REVIEW_LIKES)

        const totalLikes = await collection.countDocuments({ reviewId })

        let liked = false
        if (visitorId) {
            const existingLike = await collection.findOne({ reviewId, visitorId })
            liked = !!existingLike
        }

        return NextResponse.json({
            success: true,
            totalLikes,
            liked
        })
    } catch (error) {
        console.error("[API] Error getting likes:", error)
        return NextResponse.json(
            { success: false, error: "Failed to get likes" },
            { status: 500 }
        )
    }
}
