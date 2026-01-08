import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddIsActiveToGroup1736336400000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn(
            'groups',
            new TableColumn({
                name: 'isActive',
                type: 'boolean',
                default: true,
                isNullable: false,
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('groups', 'isActive');
    }
}
