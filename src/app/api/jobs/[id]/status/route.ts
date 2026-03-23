import { NextResponse } from "next/server"
import prisma from "@/database/prisma"

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const { id } = params
        const body = await req.json()
        const { status, feedback } = body

        const allowedStatus = ["active", "rejected", "pending"]

        if (!status || !allowedStatus.includes(status)) {
            return NextResponse.json(
                { error: "Trạng thái không hợp lệ" },
                { status: 400 }
            )
        }

        if (status === "rejected" && (!feedback || feedback.trim() === "")) {
            return NextResponse.json(
                { error: "Lý do từ chối là bắt buộc" },
                { status: 400 }
            )
        }

        const job = await prisma.job.findUnique({
            where: { id }
        })

        if (!job) {
            return NextResponse.json(
                { error: "Job không tồn tại" },
                { status: 404 }
            )
        }

        // ✅ build data rõ ràng, không check linh tinh
        const data: any = {
            status,
            updatedAt: new Date()
        }

        if (feedback !== undefined) {
            data.adminFeedback = feedback
        }

        if (status === "active") {
            data.postedAt = new Date()
        }

        await prisma.job.update({
            where: { id },
            data
        })

        return NextResponse.json({
            success: true,
            message: `Job updated to ${status}`
        })

    } catch (error: any) {
        console.error("🔥 ERROR:", error)

        return NextResponse.json(
            {
                success: false,
                error: error?.message || "Internal server error"
            },
            { status: 500 }
        )
    }
}