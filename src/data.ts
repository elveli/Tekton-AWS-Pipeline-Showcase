export interface PipelineStage {
  id: string;
  title: string;
  icon: string;
  description: string;
  overview: string;
  files: {
    filename: string;
    language: string;
    content: string;
  }[];
}

export const pipelineStages: PipelineStage[] = [
  {
    id: "docs",
    title: "Documentation & Setup",
    icon: "FileText",
    description: "Read the comprehensive guide on configuring, running, and troubleshooting this pipeline.",
    overview: "This guide provides instructions on how to use these templates on your Amazon EKS cluster.",
    files: [
      {
        filename: "README.md",
        language: "markdown",
        content: `# Tekton AWS ECR & EKS Pipeline Complete Guide

Welcome to the **Tekton on AWS Sample Application**. This guide provides comprehensive instructions on how to take the configuration templates from this repository and apply them to a real Amazon EKS cluster.

## What You See

This sample contains a set of Kubernetes manifests for [Tekton Pipelines](https://tekton.dev/). When applied, they form a robust CI/CD pipeline that:
1. **Clones** source code from a Git repository.
2. **Builds** a Docker image without privileged access using Kaniko.
3. **Pushes** the container image to Amazon Elastic Container Registry (ECR) securely utilizing IAM Roles for Service Accounts (IRSA).
4. **Deploys** the new image to an Amazon Elastic Kubernetes Service (EKS) cluster using the \`kubectl\` task.

In this interactive dashboard, click through the stages on the left to view the specific \`.yaml\` configurations needed for each step.

---

## Prerequisites

Before executing this pipeline, you need:
1. **Amazon EKS Cluster**: An active Kubernetes cluster running on AWS. *(Can be provisioned via the included Terraform configuration).*
2. **Tekton Installed**: Tekton Pipelines installed on your EKS cluster:
   \`kubectl apply --filename https://storage.googleapis.com/tekton-releases/pipeline/latest/release.yaml\`
3. **OIDC Provider Enabled**: Your EKS cluster must have an IAM OIDC provider configured (required for IRSA).
4. **AWS ECR Repository**: A target container registry. *(Can be provisioned via Terraform).*
5. **Git Repository**: A repository containing a \`Dockerfile\` and some Kubernetes deployment manifests in a \`k8s/\` folder.

---

## Local Desktop Setup (No AWS)
 
 If you just want to run this pipeline locally on **Docker Desktop**, **Minikube**, or **kind** without interacting with AWS, please refer to the **Local Desktop Setup** stage in the dashboard. 
 
 The dashboard provides alternative definitions (\`local-kaniko-task.yaml\`, \`local-pipeline.yaml\`, and \`local-pipelinerun.yaml\`) which utilize [ttl.sh](https://ttl.sh), a free, anonymous, ephemeral container registry perfect for local Tekton testing without authentication hassles!
 
 ---
 
 ## Configuration & Setup

### 0. (Optional) Provision Infrastructure with Terraform

If you prefer Infrastructure as Code over manual setup, check the **Infrastructure as Code** stage in the dashboard.
It provides a \`main.tf\` file that provisions a complete **VPC**, an **EKS Cluster**, the **ECR repository**, and the OIDC-backed **IAM Role** for Tekton.

\`\`\`bash
terraform init
terraform apply
# After applying, configure your local kubeconfig:
aws eks update-kubeconfig --region us-east-1 --name tekton-cluster
\`\`\`

*(If you use Terraform, skip the AWS IAM steps in Section 1, but you must still apply the Kubernetes Service Account manifest).*

---

### 1. Configure the Kubernetes Service Account & IRSA

Regardless of whether you used Terraform or a manual AWS setup, your Kubernetes cluster needs a \`ServiceAccount\` properly annotated with the AWS IAM Role ARN so Tekton can authenticate via IRSA.

**If you used Terraform:**
1. Get the generated IAM Role ARN:
   \`\`\`bash
   terraform output iam_role_arn
   \`\`\`
2. Edit \`tekton/01-service-account.yaml\` and replace the \`eks.amazonaws.com/role-arn\` annotation with your actual ARN.
3. Apply the manifest:
   \`\`\`bash
   kubectl apply -f tekton/01-service-account.yaml
   \`\`\`
4. *Skip to Step 2.*

**If you are doing a manual setup (No Terraform):**
If you didn't run Terraform, you can configure the AWS resources manually using \`aws\` and \`eksctl\`:

**A. Create an IAM Policy for ECR Access:**
Copy the policy from the "AWS IRSA Setup" stage (\`tekton/iam-policy.json\`) and create it in AWS IAM:
\`aws iam create-policy --policy-name TektonECRPushPolicy --policy-document file://tekton/iam-policy.json\`

**B. Create IAM Role mapped to the Service Account:**
Using \`eksctl\`, create an IAM role bound to the \`tekton-aws-sa\` ServiceAccount in the \`build-system\` namespace.
\`\`\`bash
eksctl create iamserviceaccount \\
  --cluster=<YOUR_CLUSTER_NAME> \\
  --namespace=build-system \\
  --name=tekton-aws-sa \\
  --attach-policy-arn=arn:aws:iam::<ACCOUNT_ID>:policy/TektonECRPushPolicy \\
  --approve
\`\`\`

*(Note: \`eksctl create iamserviceaccount\` automatically creates the Kubernetes ServiceAccount for you. You do not need to apply \`tekton/01-service-account.yaml\` if you chose this route).*

### 2. Apply Tekton Tasks

You need to register the reusable "Tasks" with your cluster:

1. **Git Clone Task**:
   \`kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml\`
2. **Kaniko ECR Task**:
   \`kubectl apply -f tekton/03-kaniko-ecr-task.yaml\`
3. **Deploy EKS Task**:
   \`kubectl apply -f tekton/04-kubectl-deploy-task.yaml\`

### 3. Apply and Trigger the Pipeline

1. **Apply the Pipeline definition**:
   \`kubectl apply -f tekton/05-pipeline.yaml\`

2. **Trigger the run**: Update parameters in \`tekton/06-pipelinerun.yaml\` to point to your specific repository and registry, then run:
   \`kubectl create -f tekton/06-pipelinerun.yaml\`

---

## Monitoring and Execution

Once the \`PipelineRun\` is created, Tekton orchestrates the pods.

### Using Tekton Dashboard (Web UI)
Tekton provides an official web-based dashboard that lets you visualize Pipelines, PipelineRuns, and Task logs directly from your browser.

Install the Dashboard:
\`\`\`bash
kubectl apply --filename https://storage.googleapis.com/tekton-releases/dashboard/latest/release.yaml
\`\`\`

Access the Dashboard via port-forwarding:
\`\`\`bash
kubectl --namespace tekton-pipelines port-forward svc/tekton-dashboard 9097:9097
\`\`\`
Then, open [http://localhost:9097](http://localhost:9097) in your browser.

### Using Tekton CLI (\`tkn\`)
The Tekton CLI (\`tkn\`) provides the best developer experience for managing pipelines.

Observe the logs interactively for the last PipelineRun:
\`\`\`bash
tkn pipelinerun logs -f -L
\`\`\`

List all PipelineRuns:
\`\`\`bash
tkn pipelinerun list
\`\`\`

Describe a specific PipelineRun to see detailed task status:
\`\`\`bash
tkn pipelinerun describe <run-name>
\`\`\`

Cancel a running PipelineRun:
\`\`\`bash
tkn pipelinerun cancel <run-name>
\`\`\`

### Using kubectl
If you don't have the \`tkn\` CLI installed, \`kubectl\` works too.

Check the status of the PipelineRun:
\`\`\`bash
kubectl get pipelinerun
\`\`\`

Describe the PipelineRun in detail (useful for finding why a run failed or is pending):
\`\`\`bash
kubectl describe pipelinerun <run-name>
\`\`\`

Check the individual underlying TaskRuns:
\`\`\`bash
kubectl get taskrun
kubectl describe taskrun <taskrun-name>
\`\`\`

Get logs of the actual Pod running the Task:
\`\`\`bash
kubectl get pods
# Note: Tekton pods usually have the TaskRun name prefix
kubectl logs <pod-name> -c step-<step-name>
\`\`\`

---

## Troubleshooting Guide

### 1. ImagePullBackOff or unauthorized on push
**Cause**: The Kaniko task pod doesn't have the AWS credentials to push to ECR.
**Fix**: Verify the ServiceAccount (\`tekton-aws-sa\`) has the correct \`eks.amazonaws.com/role-arn\` annotation and the Trust Relationship allows the exact OIDC subject. Ensure \`AWS_SDK_LOAD_CONFIG="true"\` is passed to the Kaniko container.

### 2. fetch-repository fails with Authentication Error
**Cause**: The Git repository is private.
**Fix**: Create a Kubernetes Secret containing your Git credentials and attach it to the \`tekton-aws-sa\` ServiceAccount.

### 3. PipelineRun stays in Pending state
**Cause**: Usually a missing Workspace (PersistentVolumeClaim).
**Fix**: Ensure your cluster has a default StorageClass capable of dynamic provisioning, or manually create the PersistentVolume attached to the Workspace.

### 4. Deploy task fails with PermissionDenied
**Cause**: The Service Account lacks Kubernetes RBAC permissions to apply deployments.
**Fix**: Create a Role and RoleBinding granting edit access to \`tekton-aws-sa\` in the target namespace.`
      }
    ]
  },
  {
    id: "local-desktop",
    title: "Local Desktop Setup",
    icon: "Monitor",
    description: "Run the Tekton pipeline entirely locally using Docker Desktop or Minikube without AWS.",
    overview: "You don't need AWS to test Tekton! This configuration uses an ephemeral, anonymous container registry (ttl.sh) and standard components, allowing you to run and debug the entire build-and-deploy pipeline locally on Docker Desktop, Minikube, or kind.",
    files: [
      {
        filename: "local-kaniko-task.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: kaniko-local
  namespace: build-system
spec:
  workspaces:
    - name: source
  params:
    - name: IMAGE
      description: Target registry image
    - name: DOCKERFILE
      default: ./Dockerfile
    - name: CONTEXT
      default: ./
  steps:
    - name: build-and-push
      image: gcr.io/kaniko-project/executor:latest
      workingDir: $(workspaces.source.path)
      command:
        - /workspace/executor
      args:
        - --dockerfile=$(params.DOCKERFILE)
        - --context=$(workspaces.source.path)/$(params.CONTEXT)
        - --destination=$(params.IMAGE)
`
      },
      {
        filename: "local-pipeline.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: local-demo-pipeline
  namespace: build-system
spec:
  workspaces:
    - name: shared-data
  params:
    - name: git-url
      type: string
    - name: image-url
      type: string
  tasks:
    - name: fetch-repository
      taskRef:
        name: git-clone
      workspaces:
        - name: output
          workspace: shared-data
      params:
        - name: url
          value: $(params.git-url)
        - name: deleteExisting
          value: "true"

    - name: build-and-push-local
      taskRef:
        name: kaniko-local
      runAfter:
        - fetch-repository
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)

    - name: deploy-locally
      taskRef:
        name: deploy-eks # The deploy task works locally too!
      runAfter:
        - build-and-push-local
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)
`
      },
      {
        filename: "local-pipelinerun.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  generateName: local-demo-run-
  namespace: build-system
spec:
  pipelineRef:
    name: local-demo-pipeline

  # Using default service account for local (ensure it has rbac deploy permissions)
  serviceAccountName: default

  workspaces:
    - name: shared-data
      volumeClaimTemplate:
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Gi
              
  params:
    - name: git-url
      value: "https://github.com/my-org/my-app.git"
    # ttl.sh is a free, ephemeral container registry perfect for local testing!
    # Images automatically expire after 1 hour (or 24h, depending on tag)
    - name: image-url
      value: "ttl.sh/my-local-tekton-demo-99:1h"
`
      }
    ]
  },
  {
    id: "infrastructure",
    title: "Infrastructure as Code",
    icon: "Cloud",
    description: "Terraform configuration to provision the EKS cluster, VPC, ECR repository, and IAM OIDC mapping for IRSA.",
    overview: "To avoid creating AWS resources manually, you can use Terraform. This configuration uses the official AWS modules to set up a new Virtual Private Cloud (VPC) and an Amazon EKS cluster with managed node groups. It also sets up the Amazon ECR repository and provisions the necessary IAM Role attached to the EKS cluster's OIDC provider, allowing the 'tekton-aws-sa' Kubernetes ServiceAccount to assume it securely.",
    files: [
      {
        filename: "providers.tf",
        language: "hcl",
        content: `terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}`
      },
      {
        filename: "variables.tf",
        language: "hcl",
        content: `variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster"
  type        = string
  default     = "tekton-cluster"
}

variable "vpc_cidr" {
  description = "The CIDR block for the VPC"
  type        = string
  default     = "10.45.0.0/16"
}`
      },
      {
        filename: "main.tf",
        language: "hcl",
        content: `# 1. Create a VPC for the EKS Cluster
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "\${var.cluster_name}-vpc"
  cidr = var.vpc_cidr

  azs             = ["\${var.aws_region}a", "\${var.aws_region}b", "\${var.aws_region}c"]
  private_subnets = [cidrsubnet(var.vpc_cidr, 8, 1), cidrsubnet(var.vpc_cidr, 8, 2), cidrsubnet(var.vpc_cidr, 8, 3)]
  public_subnets  = [cidrsubnet(var.vpc_cidr, 8, 101), cidrsubnet(var.vpc_cidr, 8, 102), cidrsubnet(var.vpc_cidr, 8, 103)]

  enable_nat_gateway = true
  single_nat_gateway = true
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
}

# 3. Create the ECR Repository
resource "aws_ecr_repository" "app_repo" {
  name                 = "my-app-repo"
  image_tag_mutability = "MUTABLE"
  force_delete         = true # For demo purposes

  image_scanning_configuration {
    scan_on_push = true
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
}`
      },
      {
        filename: "outputs.tf",
        language: "hcl",
        content: `output "eks_cluster_name" {
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
}`
      }
    ]
  },
  {
    id: "setup",
    title: "AWS IRSA Setup",
    icon: "Key",
    description: "Configure IAM Roles for Service Accounts to securely access AWS APIs.",
    overview: "Before a Tekton pipeline can push to Amazon ECR or deploy to Amazon EKS without hardcoded credentials, it needs to utilize IAM Roles for Service Accounts (IRSA). We create an IAM role with the necessary ECR permissions, and associate it with a Kubernetes ServiceAccount used by our Tekton TaskRuns and PipelineRuns.",
    files: [
      {
        filename: "01-service-account.yaml",
        language: "yaml",
        content: `apiVersion: v1
kind: ServiceAccount
metadata:
  name: tekton-aws-sa
  namespace: build-system
  annotations:
    # Associate this ServiceAccount with your AWS IAM Role configured for ECR access
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789012:role/TektonPipelineRole
secrets:
  # Optional: For private Git repository access
  - name: git-credentials
`
      },
      {
        filename: "iam-policy.json",
        language: "json",
        content: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
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
      ],
      "Resource": "*"
    }
  ]
}`
      }
    ]
  },
  {
    id: "clone",
    title: "Fetch Source",
    icon: "GitBranch",
    description: "Clone the source code from a Git repository.",
    overview: "The first step in our Tekton pipeline is to retrieve the application source code. We use the standard 'git-clone' task from the Tekton Hub. It stores the checked-out source code into a Workspace backed by a PersistentVolumeClaim, so subsequent steps can access the code.",
    files: [
      {
        filename: "02-git-clone-task.yaml",
        language: "yaml",
        content: `# We use the standard git-clone task from tektoncd/catalog.
# You can install it directly on your cluster:
# kubectl apply -f https://raw.githubusercontent.com/tektoncd/catalog/main/task/git-clone/0.9/git-clone.yaml
#
# This relies on the Workspace (shared volume) attached to the PipelineRun.
`
      }
    ]
  },
  {
    id: "build-push",
    title: "Build & Push (ECR)",
    icon: "Package",
    description: "Build the Docker image and push to Amazon ECR.",
    overview: "We use Kaniko to build the Docker image without requiring a Docker daemon (rootless build). Kaniko natively supports Amazon ECR using the embedded 'docker-credential-ecr-login' helper. Because our PipelineRun uses our IRSA-configured ServiceAccount, Kaniko automatically assumes the IAM role and authentically pushes the image to our private ECR repository.",
    files: [
      {
        filename: "03-kaniko-ecr-task.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: kaniko-ecr
  namespace: build-system
spec:
  workspaces:
    - name: source
      description: The workspace holding the source code
  params:
    - name: IMAGE
      description: Name (and tag) of the ECR image to build and push.
    - name: DOCKERFILE
      description: Path to the Dockerfile to build.
      default: ./Dockerfile
    - name: CONTEXT
      description: Path to the directory to use as context.
      default: ./
  steps:
    - name: build-and-push
      # Kaniko executor image
      image: gcr.io/kaniko-project/executor:latest
      workingDir: $(workspaces.source.path)
      env:
        # Use the IRSA credentials automatically fetched via AWS SDK inside Kaniko
        - name: AWS_SDK_LOAD_CONFIG
          value: "true"
      command:
        - /workspace/executor
      args:
        - --dockerfile=$(params.DOCKERFILE)
        - --context=$(workspaces.source.path)/$(params.CONTEXT)
        - --destination=$(params.IMAGE)
        # Instructs kaniko to use the AWS ECR credential helper
        - --verbosity=info
`
      }
    ]
  },
  {
    id: "deploy",
    title: "Deploy to EKS",
    icon: "Server",
    description: "Apply Kubernetes manifests to the target EKS cluster.",
    overview: "Finally, we update our application manifests with the new ECR image digest or tag, and deploy them to the running Amazon EKS cluster. Since Tekton is running inside the same cluster (or a management EKS cluster), we can use the 'kubectl' CLI image. Role-Based Access Control (RBAC) allows our ServiceAccount to apply resources to the cluster.",
    files: [
      {
        filename: "04-kubectl-deploy-task.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Task
metadata:
  name: deploy-eks
  namespace: build-system
spec:
  workspaces:
    - name: source
  params:
    - name: IMAGE
      description: The new image URL to deploy
  steps:
    # Simple example using sed and kubectl. 
    # Real implementations might use Kustomize, Helm, or ArgoCD.
    - name: update-and-apply
      image: roffe/kubectl:latest
      workingDir: $(workspaces.source.path)
      script: |
        #!/bin/sh
        set -e
        echo "Updating deployment manifest with new image: \${IMAGE}"
        sed -i "s|image: .*|image: \${IMAGE}|g" k8s/deployment.yaml
        
        echo "Applying manifests..."
        kubectl apply -f k8s/deployment.yaml
        kubectl apply -f k8s/service.yaml
        
        echo "Deployment triggered successfully."
`
      }
    ]
  },
  {
    id: "pipeline",
    title: "Pipeline Execution",
    icon: "FastForward",
    description: "Tie the steps into a complete Tekton Pipeline and PipelineRun.",
    overview: "We bring all the Tasks together into a Pipeline that executes them sequentially, passing the Workspace between them. We then instantiate a PipelineRun to actually trigger the build, referencing our ECR repository, Git URL, and ServiceAccount.",
    files: [
      {
        filename: "05-pipeline.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: Pipeline
metadata:
  name: aws-ecr-eks-pipeline
  namespace: build-system
spec:
  workspaces:
    - name: shared-data
  params:
    - name: git-url
      type: string
    - name: image-url
      type: string
  tasks:
    - name: fetch-repository
      taskRef:
        name: git-clone
      workspaces:
        - name: output
          workspace: shared-data
      params:
        - name: url
          value: $(params.git-url)
        - name: deleteExisting
          value: "true"

    - name: build-and-push-ecr
      taskRef:
        name: kaniko-ecr
      runAfter:
        - fetch-repository
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)

    - name: deploy-to-cluster
      taskRef:
        name: deploy-eks
      runAfter:
        - build-and-push-ecr
      workspaces:
        - name: source
          workspace: shared-data
      params:
        - name: IMAGE
          value: $(params.image-url)
`
      },
      {
        filename: "06-pipelinerun.yaml",
        language: "yaml",
        content: `apiVersion: tekton.dev/v1beta1
kind: PipelineRun
metadata:
  generateName: my-app-deploy-run-
  namespace: build-system
spec:
  pipelineRef:
    name: aws-ecr-eks-pipeline
  
  # Ensure we use the SA configured with IRSA for AWS ECR push
  serviceAccountName: tekton-aws-sa
  
  workspaces:
    - name: shared-data
      volumeClaimTemplate:
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Gi
              
  params:
    - name: git-url
      value: "https://github.com/my-org/my-app.git"
    - name: image-url
      value: "123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-app:v1.0.4"
`
      }
    ]
  }
];
