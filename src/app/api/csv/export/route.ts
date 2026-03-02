import { NextResponse } from "next/server"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get("type") || "reviews"

    // Mock data - in production, fetch from MongoDB
    let data: Record<string, any>[] = []
    let headers: string[] = []

    if (type === "reviews") {
      headers = ["id", "author", "rating", "content", "date", "likes", "source"]
      data = [
        {
          id: "1",
          author: "Nguyen Van A",
          rating: 5,
          content: "Truong rat tot",
          date: "2025-12-10",
          likes: 24,
          source: "Google Maps",
        },
        {
          id: "2",
          author: "Tran Thi B",
          rating: 4,
          content: "Giang vien nhiet tinh",
          date: "2025-12-08",
          likes: 18,
          source: "Google Maps",
        },
      ]
    } else if (type === "jobs") {
      headers = ["id", "title", "company", "location", "type", "salary", "deadline", "status", "applicants"]
      data = [
        {
          id: "1",
          title: "Frontend Developer",
          company: "FPT",
          location: "HCM",
          type: "internship",
          salary: "5-8M",
          deadline: "2025-12-30",
          status: "active",
          applicants: 45,
        },
      ]
    } else if (type === "users") {
      headers = ["id", "name", "email", "role", "status", "createdAt"]
      data = [
        {
          id: "1",
          name: "Nguyen Van A",
          email: "a@gdu.edu.vn",
          role: "student",
          status: "active",
          createdAt: "2025-12-01",
        },
      ]
    }

    // Generate CSV content
    const csvLines = [headers.join(",")]
    data.forEach((row) => {
      const values = headers.map((h) => String(row[h] || "").replace(/,/g, ";"))
      csvLines.push(values.join(","))
    })

    const csvContent = csvLines.join("\n")

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename=${type}_export_${Date.now()}.csv`,
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Failed to export CSV" }, { status: 500 })
  }
}
