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
