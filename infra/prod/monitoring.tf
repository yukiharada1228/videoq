resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project}-${var.environment}-dashboard"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric",
        x    = 0, y = 0, width = 12, height = 6,
        properties = {
          title  = "ALB 5xx Count"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", aws_lb.web.arn_suffix]
          ]
          stat   = "Sum"
          period = 60
        }
      },
      {
        type = "metric",
        x    = 12, y = 0, width = 12, height = 6,
        properties = {
          title  = "ECS CPU Utilization"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.this.name]
          ]
          stat   = "Average"
          period = 60
        }
      },
      {
        type = "metric",
        x    = 0, y = 6, width = 12, height = 6,
        properties = {
          title  = "ECS Memory Utilization"
          view   = "timeSeries"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.this.name]
          ]
          stat   = "Average"
          period = 60
        }
      }
    ]
  })
}
