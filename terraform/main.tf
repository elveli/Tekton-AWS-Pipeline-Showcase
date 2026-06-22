# 1. Create a VPC for the EKS Cluster
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = [cidrsubnet(var.vpc_cidr, 8, 1), cidrsubnet(var.vpc_cidr, 8, 2), cidrsubnet(var.vpc_cidr, 8, 3)]
  public_subnets  = [cidrsubnet(var.vpc_cidr, 8, 101), cidrsubnet(var.vpc_cidr, 8, 102), cidrsubnet(var.vpc_cidr, 8, 103)]

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    terraform = "true"
  }
}

# 2. Provision the EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.30"

  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.private_subnets
  control_plane_subnet_ids = module.vpc.public_subnets
  
  cluster_endpoint_public_access = true
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    default = {
      ami_type       = "AL2_x86_64"
      min_size       = 2
      max_size       = 5
      desired_size   = 2
      instance_types = ["t3.medium"]
    }
  }

  tags = {
    terraform = "true"
  }
}

# 3. Create the ECR Repository
resource "aws_ecr_repository" "app_repo" {
  name                 = "my-app-repo"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # For demo purposes

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    terraform = "true"
  }
}

# 4. IAM Policy for ECR Access (Push/Pull)
resource "aws_iam_policy" "tekton_ecr_policy" {
  name        = "TektonECRPushPolicy"
  description = "Allows Tekton pipeline to push to ECR"
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:GetRepositoryPolicy",
          "ecr:DescribeRepositories",
          "ecr:ListImages",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    terraform = "true"
  }
}

# 5. IAM Role for Service Accounts (IRSA)
# This allows the Kubernetes ServiceAccount to assume the AWS IAM Role
module "vpc_cni_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name = "TektonPipelineRole"
  
  role_policy_arns = {
    policy = aws_iam_policy.tekton_ecr_policy.arn
  }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["build-system:tekton-aws-sa"]
    }
  }

  tags = {
    terraform = "true"
  }
}
