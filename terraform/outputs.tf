output "eks_cluster_name" {
  description = "The name of the EKS cluster"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "Endpoint for your Kubernetes API server"
  value       = module.eks.cluster_endpoint
}

output "ecr_repository_url" {
  description = "The URL of the repository"
  value       = aws_ecr_repository.app_repo.repository_url
}

output "iam_role_arn" {
  description = "ARN of IAM role for Tekton Service Account"
  value       = module.vpc_cni_irsa.iam_role_arn
}
