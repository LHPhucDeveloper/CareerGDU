import { NextResponse } from "next/server"
import { getCollection, COLLECTIONS } from "@/database/connection"
import { headers } from "next/headers"

export interface Visitor {
    ip: string
    userAgent: string
    page: string
    referrer?: string
    userId?: string
    userName?: string
    visitedAt: Date
    country?: string
    device?: string
}

// Helper to detect device type
function getDeviceType(userAgent: string): string {
    if (/mobile/i.test(userAgent)) return "Mobile"
    if (/tablet/i.test(userAgent)) return "Tablet"
    return "Desktop"
}

// Helper to get browser name
function getBrowserName(userAgent: string): string {
    if (/chrome/i.test(userAgent) && !/edg/i.test(userAgent)) return "Chrome"
    if (/firefox/i.test(userAgent)) return "Firefox"
    if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return "Safari"
    if (/edg/i.test(userAgent)) return "Edge"
    if (/opera|opr/i.test(userAgent)) return "Opera"
    return "Other"
}

// POST - Ghi lại visitor
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { page, userId, userName, referrer } = body

        const headersList = await headers()
        const ip = headersList.get("x-forwarded-for")?.split(",")[0] ||
            headersList.get("x-real-ip") ||
            "unknown"
        const userAgent = headersList.get("user-agent") || "unknown"

        const visitor: Visitor = {
            ip,
            userAgent,
            page: page || "/",
            referrer,
            userId,
            userName,
            visitedAt: new Date(),
            device: `${getDeviceType(userAgent)} - ${getBrowserName(userAgent)}`,
        }

        const collection = await getCollection(COLLECTIONS.VISITORS)

        // Ensure index for performance on first write
        try {
            await collection.createIndex({ visitedAt: -1 })
        } catch (e) {
            // Index might already exist or background creation is fine
        }

        await collection.insertOne(visitor)

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error("Error logging visitor:", error)
        return NextResponse.json({ success: false, error: "Failed to log visitor" }, { status: 500 })
    }
}

// GET - Admin lấy danh sách visitors
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get("page") || "1")
        const limit = parseInt(searchParams.get("limit") || "50")
        const days = parseInt(searchParams.get("days") || "7")
        const download = searchParams.get("download") === "true"

        const collection = await getCollection(COLLECTIONS.VISITORS)

        // Filter by date range
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        const filter = { visitedAt: { $gte: startDate } }

        // Get total count
        const totalCount = await collection.countDocuments(filter)

        // Get visitors with pagination or full list for download
        let visitorsQuery = collection.find(filter).sort({ visitedAt: -1 })

        if (!download) {
            visitorsQuery = visitorsQuery.skip((page - 1) * limit).limit(limit)
        }

        const visitors = await visitorsQuery.toArray()

        // Calculate stats
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const todayCount = await collection.countDocuments({
            visitedAt: { $gte: today }
        })

        const uniqueIPs = await collection.distinct("ip", filter)
        const uniqueUsers = await collection.distinct("userId", {
            ...filter,
            userId: { $ne: null, $exists: true }
        })

        // Top pages
        const topPages = await collection.aggregate([
            { $match: filter },
            { $group: { _id: "$page", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]).toArray()

        return NextResponse.json({
            success: true,
            data: visitors,
            stats: {
                totalVisitors: totalCount,
                todayVisitors: todayCount,
                uniqueVisitors: uniqueIPs.length,
                loggedInUsers: uniqueUsers.length,
                topPages: topPages.map(p => ({ page: p._id, count: p.count }))
            },
            pagination: {
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
                totalCount
            }
        })
    } catch (error) {
        console.error("Error fetching visitors:", error)
        return NextResponse.json({ success: false, error: "Failed to fetch visitors" }, { status: 500 })
    }
}

// DELETE - Admin dọn dẹp dữ liệu cũ
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const days = parseInt(searchParams.get("days") || "30")

        const collection = await getCollection(COLLECTIONS.VISITORS)

        // Delete records older than 'days'
        const beforeDate = new Date()
        beforeDate.setDate(beforeDate.getDate() - days)

        const result = await collection.deleteMany({
            visitedAt: { $lt: beforeDate }
        })

        return NextResponse.json({
            success: true,
            deletedCount: result.deletedCount,
            message: `Đã xóa ${result.deletedCount} bản ghi cũ hơn ${days} ngày.`
        })
    } catch (error) {
        console.error("Error cleaning visitors:", error)
        return NextResponse.json({ success: false, error: "Failed to clean visitors" }, { status: 500 })
    }
}
