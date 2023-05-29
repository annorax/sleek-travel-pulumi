import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as dotenv from "dotenv";
import { Subnet } from "@pulumi/aws/ec2";

dotenv.config();

const numberOfAvailabilityZones = 2;

export = async () => {
    const vpc = new awsx.ec2.Vpc("slim-travel", {
        numberOfAvailabilityZones: numberOfAvailabilityZones
    });    
    const allAvailabilityZones = await aws.getAvailabilityZones(undefined, { parent: vpc });
    const availabilityZones = allAvailabilityZones.names.slice(0, numberOfAvailabilityZones);
    const dbSubnetGroup = new aws.rds.SubnetGroup("dbsubnet", {
        name: "slim-travel",
        subnetIds: vpc.privateSubnetIds,
    });
    const postgresql = new aws.rds.Cluster("postgresql", {
        availabilityZones: availabilityZones,
        dbSubnetGroupName: dbSubnetGroup.name,
        backupRetentionPeriod: 35,
        clusterIdentifier: "slim-travel",
        databaseName: "SlimTravel",
        engine: "aurora-postgresql",
        masterUsername: <string>process.env.POSTGRESQL_USERNAME,
        masterPassword: <string>process.env.POSTGRESQL_PASSWORD,
        preferredBackupWindow: "07:00-09:00"
    });
}