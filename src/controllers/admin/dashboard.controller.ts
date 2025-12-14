import { Request, Response } from 'express'
import { DashboardService } from '@/services/admin/dashboard.service'

export class DashboardController {
  private service: DashboardService

  constructor() {
    this.service = new DashboardService()
  }

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.service.getStats()
      res.status(200).json({ success: true, data: stats })
    } catch (error) {
      console.error('Error in DashboardController.getStats:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics',
      })
    }
  }
}

export default DashboardController
