import { NextResponse } from "next/server"
// Import data directly so it's bundled by Next.js
import statsData from "@/data/reviews-stats.json"

export async function GET(request: Request) {
  try {
    const stats = statsData

    if (stats) {
      return NextResponse.json({
        success: true,
        stats,
        source: "json",
      })
    }

    return NextResponse.json({
      success: true,
      stats: {
        total_reviews: 0,
        average_rating: 0,
        rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        verified_count: 0,
      },
      source: "none",
      message: "Chưa có dữ liệu. Vui lòng chạy script Python để xử lý dữ liệu.",
    })
  } catch (error) {
    console.error("[v0] Error fetching stats:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch statistics",
      },
      { status: 500 },
    )
  }
}
