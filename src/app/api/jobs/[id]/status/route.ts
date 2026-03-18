import { NextResponse } from "next/server"
import prisma from "@/database/prisma"

export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await req.json()
        const { status, feedback } = body

        if (!status || !["active", "rejected", "request_changes"].includes(status)) {
            return NextResponse.json(
                { error: "Trạng thái không hợp lệ" },
                { status: 400 }
            )
        }

        if ((status === "rejected" || status === "request_changes") && (!feedback || feedback.trim() === "")) {
            return NextResponse.json(
                { error: "Lý do từ chối là bắt buộc" },
                { status: 400 }
            )
        }

        // Find the job to get creator info
        const job = await prisma.job.findUnique({
            where: { id }
        })

        if (!job) {
            return NextResponse.json({ error: "Job not found" }, { status: 404 })
        }

        const data: any = {
            status: status,
            adminFeedback: feedback || "",
            updatedAt: new Date()
        }

        // If job is being activated, refresh the postedAt date
        if (status === 'active') {
            data.postedAt = new Date()
        }

        const updatedJob = await prisma.job.update({
            where: { id },
            data
        })

        // Notification Logic: Notify Employer
        if (job.creatorId && status && status !== job.status) {
            try {
                let message = ""
                let title = ""

                if (status === 'active') {
                    title = "Tin tuyển dụng được duyệt"
                    message = `Tin tuyển dụng "${job.title}" của bạn đã được phê duyệt và hiển thị công khai.`
                } else if (status === 'rejected' || status === 'request_changes') {
                    title = "Tin tuyển dụng cần chỉnh sửa"
                    const reason = feedback || body.adminFeedback || body.reason || ""

                    if (reason) {
                        message = `Từ chối: ${reason}. (Tin: "${job.title}")`
                    } else {
                        message = `Tin tuyển dụng "${job.title}" của bạn cần được chỉnh sửa trước khi đăng. Vui lòng kiểm tra và cập nhật lại.`
                    }
                }

                if (title) {
                    await prisma.notification.create({
                        data: {
                            userId: job.creatorId,
                            type: 'system',
                            title: title,
                            message: message,
                            read: false,
                            link: `/dashboard/my-jobs`,
                        }
                    })
                }
            } catch (err) {
                console.error("Failed to create status notification:", err)
            }
        }

        return NextResponse.json({
            success: true,
            message: `Job status updated to ${status}`,
        })
    } catch (error) {
        console.error("Error updating job status:", error)
        return NextResponse.json(
            { success: false, error: "Failed to update job status" },
            { status: 500 }
        )
    }
}

